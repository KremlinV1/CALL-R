#!/bin/bash
# Download required models for the Face Swap Agent
# Run this script once before starting the agent

set -e

MODELS_DIR="./models"
mkdir -p "$MODELS_DIR"

echo "=== PON-E-LINE Face Swap Agent — Model Downloader ==="
echo ""

# 1. inswapper_128.onnx (face swap model)
if [ -f "$MODELS_DIR/inswapper_128.onnx" ]; then
    echo "✅ inswapper_128.onnx already exists"
else
    echo "📥 Downloading inswapper_128.onnx..."
    echo ""
    echo "⚠️  This model must be downloaded manually due to license restrictions."
    echo "   1. Go to: https://huggingface.co/deepinsight/inswapper/tree/main"
    echo "   2. Download: inswapper_128.onnx"
    echo "   3. Place it in: $MODELS_DIR/inswapper_128.onnx"
    echo ""
    echo "   Alternatively, clone the Deep-Live-Cam repo and copy the model:"
    echo "   git clone https://github.com/hacksider/Deep-Live-Cam.git"
    echo "   cp Deep-Live-Cam/models/inswapper_128.onnx $MODELS_DIR/"
    echo ""
fi

# 2. buffalo_l face analysis models (insightface downloads these automatically)
echo "📥 Downloading buffalo_l face analysis models (insightface)..."
python3 -c "
from insightface.app import FaceAnalysis
fa = FaceAnalysis(name='buffalo_l', root='$MODELS_DIR', providers=['CPUExecutionProvider'])
fa.prepare(ctx_id=0, det_size=(320, 320))
print('✅ buffalo_l models downloaded')
" 2>/dev/null || echo "⚠️  Run 'pip install insightface' first, then re-run this script"

# 3. GFPGANv1.4.onnx (optional face enhancer)
if [ -f "$MODELS_DIR/GFPGANv1.4.onnx" ]; then
    echo "✅ GFPGANv1.4.onnx already exists"
else
    echo ""
    echo "📥 (Optional) GFPGANv1.4.onnx — face enhancement model"
    echo "   Download from: https://huggingface.co/hacksider/deep-live-cam/tree/main"
    echo "   Place in: $MODELS_DIR/GFPGANv1.4.onnx"
    echo "   Set FACE_SWAP_ENHANCE=true to enable"
fi

# 4. Source face image
if [ -f "$MODELS_DIR/source_face.jpg" ]; then
    echo "✅ source_face.jpg already exists"
else
    echo ""
    echo "⚠️  REQUIRED: Add your target face image"
    echo "   Place a clear, front-facing photo at: $MODELS_DIR/source_face.jpg"
    echo "   This is the face that will appear during video calls."
fi

echo ""
echo "=== Setup checklist ==="
echo "  [ ] $MODELS_DIR/inswapper_128.onnx"
echo "  [ ] $MODELS_DIR/source_face.jpg (the face to display)"
echo "  [ ] $MODELS_DIR/GFPGANv1.4.onnx (optional, for face enhancement)"
echo ""
echo "Once all models are in place, start the agent with:"
echo "  python face_swap_agent.py start"
