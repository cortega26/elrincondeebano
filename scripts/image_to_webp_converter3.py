"""
Enhanced Image to WebP Converter with GUI

This script converts image files in a specified folder to WebP format with advanced features.
It offers both command-line and graphical interfaces for user convenience.

Description:
    This script scans a given directory for image files with supported extensions
    and converts them to WebP format. It offers options for quality control,
    parallel processing, and provides a progress bar for visual feedback.

Usage:
    - Command-Line Interface:
        python image_to_webp_converter.py [folder_path] [options]
    
    - Graphical User Interface:
        Run the script without arguments:
        python image_to_webp_converter.py

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
Version: 4.0
"""

import sys
import argparse
import logging
from pathlib import Path
from PIL import Image
from concurrent.futures import ProcessPoolExecutor, as_completed
from tqdm import tqdm
import threading

# GUI imports
try:
    import tkinter as tk
    from tkinter import filedialog, messagebox
    from tkinter import ttk
except ImportError:
    print("Tkinter is not available. GUI features will not be available.")
    tk = None

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

# Configure logging
logging.basicConfig(
    filename='conversion.log',
    filemode='a',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

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
            # Preserve alpha channel without converting to 'RGB'
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


def convert_images_to_webp(folder_path: Path, output_dir: Path, include_webp: bool, quality: int, lossless: bool, workers: int, recursive: bool, progress_callback=None) -> int:
    """
    Convert all supported images in the given folder to WebP format.

    :param folder_path: Path to the folder containing images
    :param output_dir: Path to the output directory
    :param include_webp: Whether to include existing WebP files
    :param quality: WebP conversion quality (1-100)
    :param lossless: Use lossless compression if True
    :param workers: Number of worker processes for parallel conversion
    :param recursive: Recursively process subfolders if True
    :param progress_callback: Function to call to update progress (optional)
    :return: Number of failed conversions
    """
    # Gather image files
    if recursive:
        image_files = [f for f in folder_path.rglob("*") if f.is_file() and is_supported_image(f, include_webp)]
    else:
        image_files = [f for f in folder_path.iterdir() if f.is_file() and is_supported_image(f, include_webp)]
    
    if not image_files:
        logging.info("No files were found to convert to WebP format.")
        return 0

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
                if progress_callback:
                    progress_callback()
    
    # Summary log
    total_processed = len(image_files)
    successful = total_processed - failures
    logging.info(f"Image conversion completed. {total_processed} file(s) processed.")
    logging.info(f"Successful conversions: {successful}, Failures: {failures}")

    return failures


def parse_arguments():
    """
    Parse command-line arguments.

    :return: Parsed arguments
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

    return parser.parse_args()


def run_conversion(args):
    """
    Run the image conversion process based on provided arguments.

    :param args: Parsed arguments
    """
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

    failures = convert_images_to_webp(
        folder_path, 
        output_dir, 
        args.include_webp, 
        args.quality, 
        args.lossless, 
        args.workers, 
        args.recursive
    )

    if failures > 0:
        logging.warning(f"Conversion completed with {failures} failure(s). Check the log for details.")
    else:
        logging.info("All images converted successfully.")


# GUI Implementation
if tk:
    class ImageToWebPGUI:
        def __init__(self, master):
            self.master = master
            master.title("Image to WebP Converter")

            # Folder Path
            self.folder_label = tk.Label(master, text="Input Folder:")
            self.folder_label.grid(row=0, column=0, padx=10, pady=5, sticky='e')
            self.folder_path = tk.Entry(master, width=50)
            self.folder_path.grid(row=0, column=1, padx=10, pady=5)
            self.browse_button = tk.Button(master, text="Browse", command=self.browse_folder)
            self.browse_button.grid(row=0, column=2, padx=10, pady=5)

            # Output Directory
            self.output_label = tk.Label(master, text="Output Directory:")
            self.output_label.grid(row=1, column=0, padx=10, pady=5, sticky='e')
            self.output_path = tk.Entry(master, width=50)
            self.output_path.grid(row=1, column=1, padx=10, pady=5)
            self.browse_output_button = tk.Button(master, text="Browse", command=self.browse_output_folder)
            self.browse_output_button.grid(row=1, column=2, padx=10, pady=5)

            # Quality
            self.quality_label = tk.Label(master, text="Quality (1-100):")
            self.quality_label.grid(row=2, column=0, padx=10, pady=5, sticky='e')
            self.quality_var = tk.IntVar(value=80)
            self.quality_scale = tk.Scale(master, from_=1, to=100, orient='horizontal', variable=self.quality_var)
            self.quality_scale.grid(row=2, column=1, padx=10, pady=5, sticky='w')

            # Lossless
            self.lossless_var = tk.BooleanVar()
            self.lossless_check = tk.Checkbutton(master, text="Lossless Compression", variable=self.lossless_var)
            self.lossless_check.grid(row=3, column=1, padx=10, pady=5, sticky='w')

            # Include WebP
            self.include_webp_var = tk.BooleanVar()
            self.include_webp_check = tk.Checkbutton(master, text="Include Existing WebP Files", variable=self.include_webp_var)
            self.include_webp_check.grid(row=4, column=1, padx=10, pady=5, sticky='w')

            # Workers
            self.workers_label = tk.Label(master, text="Worker Processes:")
            self.workers_label.grid(row=5, column=0, padx=10, pady=5, sticky='e')
            self.workers_var = tk.IntVar(value=1)
            self.workers_spinbox = tk.Spinbox(master, from_=1, to=32, textvariable=self.workers_var, width=5)
            self.workers_spinbox.grid(row=5, column=1, padx=10, pady=5, sticky='w')

            # Recursive
            self.recursive_var = tk.BooleanVar()
            self.recursive_check = tk.Checkbutton(master, text="Process Subfolders Recursively", variable=self.recursive_var)
            self.recursive_check.grid(row=6, column=1, padx=10, pady=5, sticky='w')

            # Convert Button
            self.convert_button = tk.Button(master, text="Convert", command=self.start_conversion)
            self.convert_button.grid(row=7, column=1, padx=10, pady=20)

            # Progress Bar
            self.progress = ttk.Progressbar(master, orient='horizontal', length=400, mode='determinate')
            self.progress.grid(row=8, column=0, columnspan=3, padx=10, pady=10)

            # Status Label
            self.status_var = tk.StringVar()
            self.status_var.set("Ready")
            self.status_label = tk.Label(master, textvariable=self.status_var)
            self.status_label.grid(row=9, column=0, columnspan=3, padx=10, pady=5)

        def browse_folder(self):
            folder_selected = filedialog.askdirectory()
            if folder_selected:
                self.folder_path.delete(0, tk.END)
                self.folder_path.insert(0, folder_selected)

        def browse_output_folder(self):
            folder_selected = filedialog.askdirectory()
            if folder_selected:
                self.output_path.delete(0, tk.END)
                self.output_path.insert(0, folder_selected)

        def start_conversion(self):
            folder = self.folder_path.get()
            output = self.output_path.get() if self.output_path.get() else folder
            quality = self.quality_var.get()
            lossless = self.lossless_var.get()
            include_webp = self.include_webp_var.get()
            workers = self.workers_var.get()
            recursive = self.recursive_var.get()

            if not Path(folder).is_dir():
                messagebox.showerror("Error", "Please select a valid input folder.")
                return

            if output and not Path(output).exists():
                try:
                    Path(output).mkdir(parents=True, exist_ok=True)
                except Exception as e:
                    messagebox.showerror("Error", f"Cannot create output directory: {e}")
                    return

            # Disable the Convert button to prevent multiple clicks
            self.convert_button.config(state='disabled')
            self.status_var.set("Starting conversion...")

            # Start the conversion in a separate thread
            threading.Thread(target=self.run_conversion_thread, args=(folder, output, include_webp, quality, lossless, workers, recursive)).start()

        def run_conversion_thread(self, folder, output, include_webp, quality, lossless, workers, recursive):
            try:
                folder_path = Path(folder)
                output_dir = Path(output)

                # Gather image files
                if recursive:
                    image_files = [f for f in folder_path.rglob("*") if f.is_file() and is_supported_image(f, include_webp)]
                else:
                    image_files = [f for f in folder_path.iterdir() if f.is_file() and is_supported_image(f, include_webp)]
                
                if not image_files:
                    logging.info("No files were found to convert to WebP format.")
                    self.update_status("No files found for conversion.")
                    self.enable_convert_button()
                    return

                self.progress['maximum'] = len(image_files)
                self.progress['value'] = 0

                failures = 0

                with ProcessPoolExecutor(max_workers=workers) as executor:
                    futures = [executor.submit(process_image_task, (image, output_dir, quality, lossless)) for image in image_files]
                    
                    for future in as_completed(futures):
                        image_path, success = future.result()
                        if success:
                            logging.info(f"Converted {image_path.name} to WebP")
                        else:
                            failures += 1
                        self.progress['value'] += 1
                        self.update_status(f"Converting: {self.progress['value']}/{len(image_files)}")
                
                # Summary
                total_processed = len(image_files)
                successful = total_processed - failures
                logging.info(f"Image conversion completed. {total_processed} file(s) processed.")
                logging.info(f"Successful conversions: {successful}, Failures: {failures}")

                if failures > 0:
                    self.update_status(f"Completed with {failures} failure(s). Check log for details.")
                    messagebox.showwarning("Conversion Completed", f"Conversion completed with {failures} failure(s). Check 'conversion.log' for details.")
                else:
                    self.update_status("All images converted successfully.")
                    messagebox.showinfo("Conversion Completed", "All images converted successfully.")

            except Exception as e:
                logging.error(f"Unexpected error during conversion: {str(e)}")
                self.update_status("An error occurred. Check log for details.")
                messagebox.showerror("Error", f"An unexpected error occurred: {e}")
            finally:
                self.enable_convert_button()

        def update_status(self, message):
            self.status_var.set(message)

        def enable_convert_button(self):
            self.convert_button.config(state='normal')


def launch_gui():
    """
    Launch the graphical user interface.
    """
    root = tk.Tk()
    gui = ImageToWebPGUI(root)
    root.mainloop()


def main():
    """
    Main function to determine whether to launch GUI or run CLI based on arguments.
    """
    if len(sys.argv) > 1:
        # Run in CLI mode
        args = parse_arguments()
        run_conversion(args)
    else:
        # Run in GUI mode
        if tk:
            launch_gui()
        else:
            print("Tkinter is not available. Please run the script with command-line arguments.")
            sys.exit(1)


if __name__ == "__main__":
    main()
