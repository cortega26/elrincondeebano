"""
Enhanced Image to WebP Converter

This script converts image files in a specified folder to WebP format with advanced features.

Description:
    This script scans a given directory for image files with supported extensions
    and converts them to WebP format. It offers options for quality control,
    parallel processing, and provides a progress bar for visual feedback.

Usage:
    python script_name.py [folder_path] [options]

Arguments:
    folder_path (optional): Path to the folder containing images to convert.
                            If not provided, the current directory is used.

Options:
    --include-webp: Include existing WebP files for re-encoding. Default is False.
    --quality QUALITY: Set the quality for WebP conversion (1-100). Default is 80.
    --lossless: Use lossless compression for WebP conversion. Default is False.
    --workers WORKERS: Number of worker processes for parallel conversion. Default is 1.
    --recursive: Recursively process subfolders. Default is False.
    --output-dir OUTPUT_DIR: Specify an output directory for converted files. 
                             Default is same as input.

Requirements:
    - Python 3.x
    - Pillow library (PIL)
    - tqdm library (for progress bar)

Notes:
    - Ensure you have write permissions in the specified folder.
    - Original files are not modified or deleted.
    - Errors during conversion of individual files are reported but do not stop the process.

Example:
    python image_to_webp_converter.py /path/to/image/folder --quality 90 --workers 4 --recursive

Author: Carlos Ortega Gonzáñez (updated by Claude)
Date: 24-06-2024
Version: 3.0
"""

import sys
import argparse
import logging
from pathlib import Path
from PIL import Image
from concurrent.futures import ProcessPoolExecutor, as_completed
from tqdm import tqdm

# Supported image extensions
SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".jfif", ".pjpeg", ".pjp",  # JPEG formats
    ".png",  # PNG
    ".gif",  # GIF
    ".tiff", ".tif",  # TIFF
    ".bmp",  # BMP
    ".cur",  # CUR
    ".dib",  # DIB
    ".eps",  # EPS (requires Ghostscript)
    ".pcx",  # PCX
    ".ppm", ".pgm", ".pbm", ".pnm",  # Netpbm
    ".sgi",  # SGI
    ".tga",  # TGA
    ".jp2", ".j2k", ".jpf", ".jpx", ".jpm",  # JPEG 2000
    ".xbm",  # XBM
}

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def is_supported_image(file_path: Path, include_webp: bool) -> bool:
    """
    Check if the file has a supported image extension or if we are including WebP files.
    
    :param file_path: Path to the image file
    :param include_webp: Whether to include existing WebP files for re-encoding
    :return: True if the file is supported, False otherwise
    """
    return file_path.suffix.lower() in SUPPORTED_EXTENSIONS or (include_webp and file_path.suffix.lower() == '.webp')


def convert_to_webp(image_path: Path, output_dir: Path, quality: int, lossless: bool) -> bool:
    """
    Convert a single image to WebP format.

    :param image_path: Path to the source image file
    :param output_dir: Path to the output directory
    :param quality: Quality for WebP conversion (1-100)
    :param lossless: Use lossless compression if True
    :return: True if conversion succeeded, False otherwise
    """
    try:
        with Image.open(image_path) as img:
            # Convert to 'RGB' only if not lossless and image has alpha
            if not lossless and img.mode == 'RGBA':
                img = img.convert('RGB')
            webp_path = output_dir / f"{image_path.stem}.webp"
            img.save(webp_path, "webp", quality=quality, lossless=lossless)
        return True
    except Exception as e:
        logging.error(f"Error converting {image_path.name}: {str(e)}")
        return False


def process_image_task(args):
    """
    Process a single image conversion task. This is a helper function for parallel execution.

    :param args: A tuple containing (image_path, output_dir, quality, lossless)
    :return: A tuple (image_path, success_boolean)
    """
    image_path, output_dir, quality, lossless = args
    return image_path, convert_to_webp(image_path, output_dir, quality, lossless)


def convert_images_to_webp(folder_path: Path, output_dir: Path, include_webp: bool, quality: int, lossless: bool, workers: int, recursive: bool) -> None:
    """
    Convert all supported images in the given folder to WebP format.
    
    :param folder_path: Path to the folder containing images
    :param output_dir: Path to the output directory
    :param include_webp: Whether to include existing WebP files
    :param quality: WebP conversion quality (1-100)
    :param lossless: Use lossless compression if True
    :param workers: Number of worker processes for parallel conversion
    :param recursive: Recursively process subfolders if True
    """
    # Gather image files
    if recursive:
        image_files = [f for f in folder_path.rglob("*") if f.is_file() and is_supported_image(f, include_webp)]
    else:
        image_files = [f for f in folder_path.iterdir() if f.is_file() and is_supported_image(f, include_webp)]
    
    if not image_files:
        logging.info("No files were found to convert to WebP format.")
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    # Keep track of failures
    failures = 0

    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(process_image_task, (image, output_dir, quality, lossless)) for image in image_files]
        
        with tqdm(total=len(image_files), desc="Converting images", unit="image") as pbar:
            for future in as_completed(futures):
                image_path, success = future.result()
                if success:
                    logging.info(f"Converted {image_path.name} to WebP")
                else:
                    failures += 1
                pbar.update(1)

    # Summary log
    total_processed = len(image_files)
    successful = total_processed - failures
    logging.info(f"Image conversion completed. {total_processed} file(s) processed.")
    logging.info(f"Successful conversions: {successful}, Failures: {failures}")


def main():
    """
    Main function to handle command-line argument parsing and initiate the conversion process.
    """
    parser = argparse.ArgumentParser(description="Convert images to WebP format.")
    parser.add_argument("folder_path", nargs="?", default=r"C:/Users/corte/OneDrive/Tienda Ebano/assets/images/", 
                        help="Path to the folder containing images to convert.")
    parser.add_argument("--include-webp", action="store_true", default=False, 
                        help="Include existing WebP files for re-encoding.")
    parser.add_argument("--quality", type=int, default=80, choices=range(1, 101), metavar="[1-100]", 
                        help="Set the quality for WebP conversion (1-100).")
    parser.add_argument("--lossless", action="store_true", 
                        help="Use lossless compression for WebP conversion.")
    parser.add_argument("--workers", type=int, default=1, 
                        help="Number of worker processes for parallel conversion.")
    parser.add_argument("--recursive", action="store_true", 
                        help="Recursively process subfolders.")
    parser.add_argument("--output-dir", type=Path, 
                        help="Specify an output directory for converted files.")

    args = parser.parse_args()

    folder_path = Path(args.folder_path)
    output_dir = args.output_dir if args.output_dir else folder_path
    
    if not folder_path.is_dir():
        logging.error(f"Error: {folder_path} is not a valid directory.")
        sys.exit(1)

    logging.info(f"Converting images in {folder_path}")
    logging.info(f"Output directory: {output_dir}")
    logging.info(f"Including WebP files: {'Yes' if args.include_webp else 'No'}")
    logging.info(f"Quality: {args.quality}")
    logging.info(f"Lossless: {'Yes' if args.lossless else 'No'}")
    logging.info(f"Worker processes: {args.workers}")
    logging.info(f"Recursive: {'Yes' if args.recursive else 'No'}")

    convert_images_to_webp(folder_path, output_dir, args.include_webp, args.quality, args.lossless, args.workers, args.recursive)


if __name__ == "__main__":
    main()
