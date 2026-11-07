"""
convert.py — يجهّز حزمة نموذج التسميع (تُرفع مرة واحدة إلى إصدار GitHub).

  python -m venv .venv && .venv/Scripts/pip install -r scripts/asr/requirements.txt
  .venv/Scripts/python scripts/asr/convert.py <مجلد-الإخراج> <مسار ort-wasm-simd-threaded.jsep.wasm>
  node scripts/asr/manifest.js <مجلد-الإخراج> [--upload v1.6.0]

الخطوات:
 1. تصدير tarteel-ai/whisper-base-ar-quran (Apache-2.0) إلى ONNX عبر optimum.
 2. إزالة مدخل cache_position من المفكّك المدمج وحسابه داخل الرسم
    (transformers.js لا يرسله، والقيمة = past_len .. past_len+seq_len).
 3. تكميم ديناميكي int8 (~١٠٠ ميجا بدل ~٤٠٠).
 4. إصلاح generation_config: النموذج متعدد اللغات لكن الملف الأصلي لا يذكر ذلك.
"""
import json
import os
import shutil
import subprocess
import sys

import onnx
from onnx import TensorProto, helper
from onnxruntime.quantization import QuantType, quantize_dynamic

MODEL = 'tarteel-ai/whisper-base-ar-quran'


def export(tmp):
    subprocess.check_call([
        os.path.join(os.path.dirname(sys.executable), 'optimum-cli'), 'export', 'onnx',
        '--model', MODEL, '--task', 'automatic-speech-recognition-with-past', tmp,
    ])


def drop_cache_position(src, dst):
    m = onnx.load(src)
    g = m.graph
    cp = [i for i in g.input if i.name == 'cache_position']
    if cp:
        g.input.remove(cp[0])
        C = lambda n, v: helper.make_node('Constant', [], [n], value=helper.make_tensor(n, TensorProto.INT64, [], [v]))
        nodes = [
            C('cp_i1', 1), C('cp_i2', 2), C('cp_one', 1),
            helper.make_node('Shape', ['input_ids'], ['cp_ids_shape']),
            helper.make_node('Gather', ['cp_ids_shape', 'cp_i1'], ['cp_seq'], axis=0),
            helper.make_node('Shape', ['past_key_values.0.decoder.key'], ['cp_pk_shape']),
            helper.make_node('Gather', ['cp_pk_shape', 'cp_i2'], ['cp_past'], axis=0),
            # في الفرع بلا ذاكرة سابقة يكون «الماضي» وهميًا → البداية صفر
            helper.make_node('Cast', ['use_cache_branch'], ['cp_ucb'], to=TensorProto.INT64),
            helper.make_node('Mul', ['cp_past', 'cp_ucb'], ['cp_start']),
            helper.make_node('Add', ['cp_start', 'cp_seq'], ['cp_end']),
            helper.make_node('Range', ['cp_start', 'cp_end', 'cp_one'], ['cache_position']),
        ]
        for n in reversed(nodes):
            g.node.insert(0, n)
    onnx.save(m, dst)
    onnx.checker.check_model(dst)


def quantize(src, dst):
    quantize_dynamic(src, dst, weight_type=QuantType.QUInt8, per_channel=False,
                     reduce_range=False, extra_options={'EnableSubgraph': True})


def fix_generation_config(path):
    tok = json.load(open(os.path.join(os.path.dirname(path), 'added_tokens.json'), encoding='utf8'))
    g = json.load(open(path, encoding='utf8'))
    g['is_multilingual'] = True
    g['lang_to_id'] = {'<|ar|>': tok['<|ar|>']}
    g['task_to_id'] = {'transcribe': tok['<|transcribe|>'], 'translate': tok['<|translate|>']}
    g.setdefault('no_timestamps_token_id', tok['<|notimestamps|>'])
    json.dump(g, open(path, 'w', encoding='utf8'), indent=1)


def main():
    out, wasm = sys.argv[1], sys.argv[2]
    tmp = out + '-export'
    export(tmp)
    fix_generation_config(os.path.join(tmp, 'generation_config.json'))
    drop_cache_position(os.path.join(tmp, 'decoder_model_merged.onnx'), os.path.join(tmp, 'decoder_fixed.onnx'))

    w = os.path.join(out, 'whisper')
    os.makedirs(os.path.join(w, 'onnx'), exist_ok=True)
    for f in ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json']:
        shutil.copy(os.path.join(tmp, f), w)
    quantize(os.path.join(tmp, 'encoder_model.onnx'), os.path.join(w, 'onnx', 'encoder_model_quantized.onnx'))
    quantize(os.path.join(tmp, 'decoder_fixed.onnx'), os.path.join(w, 'onnx', 'decoder_model_merged_quantized.onnx'))

    os.makedirs(os.path.join(out, 'ort'), exist_ok=True)
    shutil.copy(wasm, os.path.join(out, 'ort', 'ort-wasm-simd-threaded.jsep.wasm'))
    print('done →', out)


if __name__ == '__main__':
    main()
