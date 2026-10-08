"""Build a tiny, random STAND-IN model with the same file layout and input/output
names as Xenova/clip-vit-base-patch32, for testing the pipeline offline.

Its predictions are deterministic functions of the pixels but carry NO meaning.
Use it only to test plumbing:  CUTWISE_MODEL_DIR=tests/fake_model uvicorn app.main:app
"""

import json
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from tokenizers import Tokenizer, models, pre_tokenizers

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.categories import CATEGORIES  # noqa: E402

out = Path(__file__).parent / "fake_model"
(out / "onnx").mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)
D = 64

# Vision: pixel_values [b,3,224,224] -> 4x4 average pool -> flatten(48) -> matmul -> image_embeds [b,64]
w = numpy_helper.from_array(rng.normal(size=(48, D)).astype(np.float32), "W")
vision = helper.make_graph(
    [
        helper.make_node("AveragePool", ["pixel_values"], ["pooled"], kernel_shape=[56, 56], strides=[56, 56]),
        helper.make_node("Flatten", ["pooled"], ["flat"], axis=1),
        helper.make_node("MatMul", ["flat", "W"], ["image_embeds"]),
    ],
    "vision",
    [helper.make_tensor_value_info("pixel_values", TensorProto.FLOAT, ["b", 3, 224, 224])],
    [helper.make_tensor_value_info("image_embeds", TensorProto.FLOAT, ["b", D])],
    [w],
)
onnx.save(helper.make_model(vision, opset_imports=[helper.make_opsetid("", 17)], ir_version=9), out / "onnx" / "vision_model_quantized.onnx")

# Text: input_ids [1,L] -> embedding lookup -> mean -> text_embeds [1,64]
words = sorted({wd for c in CATEGORIES.values() for p in c["prompts"] for wd in p.replace(",", " ").split()})
vocab = {"[UNK]": 0, **{wd: i + 1 for i, wd in enumerate(words)}}
emb = numpy_helper.from_array(rng.normal(size=(len(vocab), D)).astype(np.float32), "E")
text = helper.make_graph(
    [
        helper.make_node("Gather", ["E", "input_ids"], ["tok"]),
        helper.make_node("ReduceMean", ["tok"], ["text_embeds"], axes=[1], keepdims=0),
    ],
    "text",
    [helper.make_tensor_value_info("input_ids", TensorProto.INT64, [1, "L"])],
    [helper.make_tensor_value_info("text_embeds", TensorProto.FLOAT, [1, D])],
    [emb],
)
onnx.save(helper.make_model(text, opset_imports=[helper.make_opsetid("", 17)], ir_version=9), out / "onnx" / "text_model_quantized.onnx")

tok = Tokenizer(models.WordLevel(vocab=vocab, unk_token="[UNK]"))
tok.pre_tokenizer = pre_tokenizers.WhitespaceSplit()
tok.save(str(out / "tokenizer.json"))
(out / "preprocessor_config.json").write_text(json.dumps({"crop_size": 224}))
print("Stand-in model written to", out)
