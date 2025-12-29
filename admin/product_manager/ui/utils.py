import logging
import os
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger(__name__)

# --- Centralized PIL / Image Support Detection ---
try:
    from PIL import Image, ImageTk, features  # type: ignore
    PIL_AVAILABLE = True
    try:
        PIL_WEBP = features.check('webp')
    except Exception:
        PIL_WEBP = False
    
    # Try multiple strategies for AVIF support
    try:
        import pillow_heif  # type: ignore
        pillow_heif.register_heif_opener()
        try:
            pillow_heif.register_avif_opener()
        except Exception as exc:
            logger.debug("Failed to register AVIF opener via pillow_heif: %s", exc)
        PIL_AVIF = True
    except ImportError:
        try:
            import pillow_avif  # type: ignore  # pylint: disable=unused-import
            PIL_AVIF = True
        except ImportError:
            try:
                PIL_AVIF = features.check('avif')
            except Exception:
                PIL_AVIF = False
    except Exception:
        PIL_AVIF = False

except ImportError:
    PIL_AVAILABLE = False
    PIL_WEBP = False
    PIL_AVIF = False
    # Mocking for type hinting if needed, or just relying on checks
    Image = None
    ImageTk = None

def load_thumbnail(path: str, w: int, h: int) -> Optional[Any]:
    """
    Load and resize an image from path.
    Returns None if PIL is not available or image fails to load.
    Returns ImageTk.PhotoImage.
    """
    if not PIL_AVAILABLE:
        return None
    
    if not os.path.exists(path):
        return None

    try:
        with Image.open(path) as img:
            # Handle mode
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGBA')
            img.thumbnail((w, h))
            return ImageTk.PhotoImage(img)
    except Exception as e:
        logger.warning(f"Failed to load thumbnail {path}: {e}")
        return None
