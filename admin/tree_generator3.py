from abc import ABC, abstractmethod
from typing import List, Optional, Iterable
import os

class FileFilter(ABC):
    @abstractmethod
    def should_include(self, filename: str) -> bool:
        pass

class ExtensionFilter(FileFilter):
    def __init__(self, exclude_extensions: List[str]):
        self.exclude_extensions = exclude_extensions

    def should_include(self, filename: str) -> bool:
        return not any(filename.lower().endswith(ext) for ext in self.exclude_extensions)

class HiddenFilter(FileFilter):
    def should_include(self, filename: str) -> bool:
        return not filename.startswith('.')

class CompositeFilter(FileFilter):
    def __init__(self, filters: List[FileFilter]):
        self.filters = filters

    def should_include(self, filename: str) -> bool:
        return all(f.should_include(filename) for f in self.filters)

class TreeNode:
    def __init__(self, name: str, is_directory: bool):
        self.name = name
        self.is_directory = is_directory
        self.children: List[TreeNode] = []

class TreeBuilder:
    def __init__(self, file_filter: FileFilter):
        self.file_filter = file_filter

    def build_tree(self, path: str) -> TreeNode:
        name = os.path.basename(path) or '.'  # Use '.' for root
        node = TreeNode(name, os.path.isdir(path))

        if node.is_directory:
            try:
                with os.scandir(path) as it:
                    for entry in it:
                        if self.file_filter.should_include(entry.name):
                            child_node = self.build_tree(entry.path)
                            node.children.append(child_node)
            except PermissionError:
                print(f"Permission denied: {path}")

        return node

class TreePrinter:
    @staticmethod
    def print_tree(node: TreeNode, prefix: str = "", is_last: bool = True, is_root: bool = False):
        if is_root:
            print(node.name)
        else:
            print(f"{prefix}{'└── ' if is_last else '├── '}{node.name}{'/' if node.is_directory else ''}")
        
        if not is_root:
            prefix += "    " if is_last else "│   "
        
        child_count = len(node.children)
        for i, child in enumerate(node.children):
            is_last_child = i == child_count - 1
            TreePrinter.print_tree(child, prefix, is_last_child, is_root=False)

class DirectoryTreeGenerator:
    def __init__(self, file_filter: FileFilter):
        self.tree_builder = TreeBuilder(file_filter)

    def generate_tree(self, startpath: str):
        if not os.path.isdir(startpath):
            raise ValueError(f"Error: {startpath} is not a valid directory.")

        root_node = self.tree_builder.build_tree(startpath)
        TreePrinter.print_tree(root_node, is_root=True)

def create_default_filter(include_hidden: bool = False, exclude_extensions: Optional[List[str]] = None) -> FileFilter:
    filters = []
    if not include_hidden:
        filters.append(HiddenFilter())
    if exclude_extensions:
        filters.append(ExtensionFilter(exclude_extensions))
    return CompositeFilter(filters)

if __name__ == "__main__":
    try:
        project_path = input("Enter the path to your project: ")
        default_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.py', '.ico']
        file_filter = create_default_filter(include_hidden=False, exclude_extensions=default_extensions)
        tree_generator = DirectoryTreeGenerator(file_filter)
        tree_generator.generate_tree(project_path)
    except ValueError as e:
        print(e)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")