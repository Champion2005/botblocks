import io
from ultralytics import YOLO as _YOLO


class Box:
    def __init__(self, x, y, w, h):
        self.x = x
        self.y = y
        self.w = w
        self.h = h


class YOLO:
    # COCO class names that YOLO knows (index -> name)
    _COCO_NAMES = None

    def __init__(self, url=None, download=False):
        self._model = _YOLO(url or "yolo11n.pt")

    def find(self, label, image):
        """Run YOLO on image, return Box for best match of label or None."""
        from PIL import Image

        if isinstance(image, (bytes, bytearray)):
            if not image:
                return None
            image = Image.open(io.BytesIO(image))

        results = self._model(image, verbose=False)
        if not results:
            return None

        best_box = None
        best_conf = 0.0
        r = results[0]
        h, w = r.orig_shape

        for box, cls_id, conf in zip(r.boxes.xyxy, r.boxes.cls, r.boxes.conf):
            name = r.names[int(cls_id)]
            if label.replace(" ", "") not in name.replace(" ", ""):
                continue
            conf_val = float(conf)
            if conf_val > best_conf:
                best_conf = conf_val
                x1, y1, x2, y2 = [float(v) for v in box]
                cx = ((x1 + x2) / 2) / w
                cy = ((y1 + y2) / 2) / h
                bw = (x2 - x1) / w
                bh = (y2 - y1) / h
                best_box = Box(cx, cy, bw, bh)

        return best_box
