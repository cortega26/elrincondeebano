import json
import tkinter as tk
import os
from tkinter import ttk, messagebox, simpledialog, filedialog
from typing import List, Optional

# Define the base directory for image storage
IMAGE_BASE_DIR = "assets/images/uploads/"

class Product:
    def __init__(self, name: str, description: str, price: int, stock: bool, category: str, image_path: str = ""):
        self.name = name
        self.description = description
        self.price = price
        self.stock = stock
        self.category = category
        self.image_path = image_path

class ProductRepository:
    def __init__(self, file_path: str):
        self.file_path = os.path.join('_products', file_path)

    def load_products(self) -> List[Product]:
        try:
            with open(self.file_path, "r") as file:
                products_data = json.load(file)
                return [Product(**product) for product in products_data]
        except FileNotFoundError:
            return []
        except json.JSONDecodeError:
            return []

    def save_products(self, products: List[Product]):
        products_data = [product.__dict__ for product in products]
        try:
            with open(self.file_path, "w") as file:
                json.dump(products_data, file, indent=2)
        except IOError:
            messagebox.showerror("Error", "Failed to save product data.")

class ProductManagerGUI:
    def __init__(self, master: tk.Tk, product_repository: ProductRepository):
        self.master = master
        self.product_repository = product_repository
        self.products: List[Product] = []
        self.setup_gui()
        self.load_products()

    def setup_gui(self):
        self.master.title("Administrador de Productos")

        self.status_var = tk.StringVar()
        self.status_var.set("Ready")
        self.status_bar = tk.Label(self.master, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        self.status_bar.pack(side=tk.BOTTOM, fill=tk.X)

        self.spinner_canvas = tk.Canvas(self.master, width=20, height=20)
        self.spinner_id = None

        self.tree = self.create_treeview()
        self.tree.pack(fill=tk.BOTH, expand=True)

        self.search_entry = tk.Entry(self.master)
        self.search_entry.pack(side=tk.LEFT, padx=5, pady=5)
        self.search_button = tk.Button(self.master, text="Buscar", command=self.search_products)
        self.search_button.pack(side=tk.LEFT)

        self.sort_var = tk.StringVar(value="name")
        self.sort_dropdown = ttk.Combobox(self.master, textvariable=self.sort_var, values=["name", "price", "category"])
        self.sort_dropdown.pack(side=tk.LEFT, padx=5)
        self.sort_button = tk.Button(self.master, text="Ordenar", command=self.sort_products)
        self.sort_button.pack(side=tk.LEFT)

        self.filter_category_var = tk.StringVar(value="Todas")
        self.filter_category_dropdown = ttk.Combobox(self.master, textvariable=self.filter_category_var, values=self.get_all_categories() + ["Todas"], state="readonly")
        self.filter_category_dropdown.pack(side=tk.LEFT, padx=5)
        self.filter_category_dropdown.bind("<<ComboboxSelected>>", self.filter_by_category)

        self.add_button = tk.Button(self.master, text="Agregar", command=self.add_product)
        self.add_button.pack(side=tk.RIGHT, padx=5, pady=5)
        self.edit_button = tk.Button(self.master, text="Editar", command=self.edit_product)
        self.edit_button.pack(side=tk.RIGHT)
        self.delete_button = tk.Button(self.master, text="Eliminar", command=self.delete_product)
        self.delete_button.pack(side=tk.RIGHT)
        self.save_button = tk.Button(self.master, text="Guardar", command=self.save_products)
        self.save_button.pack(side=tk.RIGHT)

        self.create_category_button = tk.Button(self.master, text="Crear Categoría", command=self.create_category)
        self.create_category_button.pack(side=tk.RIGHT, padx=5)
        self.update_category_button = tk.Button(self.master, text="Actualizar Categoría", command=self.update_category)
        self.update_category_button.pack(side=tk.RIGHT)
        self.delete_category_button = tk.Button(self.master, text="Eliminar Categoría", command=self.delete_category)
        self.delete_category_button.pack(side=tk.RIGHT)

    def create_treeview(self) -> ttk.Treeview:
        tree = ttk.Treeview(self.master, columns=("name", "description", "price", "stock", "category", "image_path"), show="headings")
        tree.heading("name", text="Nombre")
        tree.heading("description", text="Descripción")
        tree.heading("price", text="Precio")
        tree.heading("stock", text="En Stock")
        tree.heading("category", text="Categoría")
        tree.heading("image_path", text="Imagen")
        tree.column("name", width=150)
        tree.column("description", width=200)
        tree.column("price", width=80)
        tree.column("stock", width=80)
        tree.column("category", width=100)
        tree.column("image_path", width=200)
        tree.pack(fill=tk.BOTH, expand=True)

        tree.bind('<ButtonRelease-1>', self.on_tree_click)

        return tree

    def load_products(self):
        self.show_spinner()
        self.products = self.product_repository.load_products()
        self.populate_tree()
        self.update_category_dropdowns()
        self.hide_spinner()
        self.set_status("Productos cargados correctamente.")

    def populate_tree(self):
        self.tree.delete(*self.tree.get_children())
        for product in self.products:
            self.tree.insert("", "end", values=(product.name, product.description, product.price, "Sí" if product.stock else "No", product.category, product.image_path))

    def save_products(self):
        self.show_spinner()
        self.product_repository.save_products(self.products)
        self.hide_spinner()
        self.set_status("Productos guardados correctamente.")
        messagebox.showinfo("Éxito", "Los productos se han guardado correctamente.")

    def add_product(self):
        add_window = self.create_product_window("Agregar Producto")

        def add():
            try:
                product = self.get_product_from_entries(add_window)
                self.products.append(product)
                self.populate_tree()
                self.update_category_dropdowns()
                add_window.destroy()
                self.set_status(f"Producto '{product.name}' agregado.")
            except ValueError as e:
                messagebox.showerror("Error", str(e))

        self.create_window_buttons(add_window, add)

    def edit_product(self):
        selected_item = self.tree.selection()
        if not selected_item:
            messagebox.showwarning("Advertencia", "Por favor, selecciona un producto para editar.")
            return

        values = self.tree.item(selected_item)["values"]
        product = next((p for p in self.products if p.name == values[0]), None)

        if product:
            edit_window = self.create_product_window("Editar Producto", product)

            def update():
                try:
                    updated_product = self.get_product_from_entries(edit_window)
                    index = self.products.index(product)
                    self.products[index] = updated_product
                    self.populate_tree()
                    self.update_category_dropdowns()
                    edit_window.destroy()
                    self.set_status(f"Producto '{product.name}' actualizado.")
                except ValueError as e:
                    messagebox.showerror("Error", str(e))

            self.create_window_buttons(edit_window, update)

    def delete_product(self):
        selected_item = self.tree.selection()
        if not selected_item:
            messagebox.showwarning("Advertencia", "Por favor, selecciona un producto para eliminar.")
            return

        values = self.tree.item(selected_item)["values"]
        product = next((p for p in self.products if p.name == values[0]), None)

        if product:
            confirm = messagebox.askyesno("Confirmar", f"¿Estás seguro de eliminar el producto '{product.name}'?")
            if confirm:
                self.products.remove(product)
                self.populate_tree()
                self.update_category_dropdowns()
                self.set_status(f"Producto '{product.name}' eliminado.")

    def search_products(self):
        query = self.search_entry.get().lower()
        filtered_products = [p for p in self.products if query in p.name.lower() or query in p.description.lower()]
        self.tree.delete(*self.tree.get_children())
        for product in filtered_products:
            self.tree.insert("", "end", values=(product.name, product.description, product.price, "Sí" if product.stock else "No", product.category, product.image_path))
        self.set_status(f"Se encontraron {len(filtered_products)} productos que coinciden con '{query}'.")

    def sort_products(self):
        sort_key = self.sort_var.get()
        self.products.sort(key=lambda p: getattr(p, sort_key))
        self.populate_tree()
        self.set_status(f"Productos ordenados por {sort_key}.")

    def filter_by_category(self, event):
        category = self.filter_category_var.get()
        if category == "Todas":
            filtered_products = self.products
        else:
            filtered_products = [p for p in self.products if p.category == category]
        self.tree.delete(*self.tree.get_children())
        for product in filtered_products:
            self.tree.insert("", "end", values=(product.name, product.description, product.price, "Sí" if product.stock else "No", product.category, product.image_path))
        self.set_status(f"Filtro de categoría aplicado. Mostrando {len(filtered_products)} productos.")

    def get_all_categories(self) -> List[str]:
        categories = set(product.category for product in self.products)
        return sorted(categories)

    def update_category_dropdowns(self):
        categories = self.get_all_categories()
        self.filter_category_dropdown['values'] = categories + ["Todas"]
        # Update category dropdowns in the product window if open
        for window in self.master.winfo_children():
            if isinstance(window, tk.Toplevel):
                try:
                    window.category_dropdown['values'] = categories
                except AttributeError:
                    continue

    def create_product_window(self, title: str, product: Optional[Product] = None) -> tk.Toplevel:
        window = tk.Toplevel(self.master)
        window.title(title)
        window.geometry("450x300")

        tk.Label(window, text="Nombre:").grid(row=0, column=0, sticky=tk.W, padx=10, pady=5)
        name_entry = tk.Entry(window, width=40)
        name_entry.grid(row=0, column=1, padx=10, pady=5)

        tk.Label(window, text="Descripción:").grid(row=1, column=0, sticky=tk.W, padx=10, pady=5)
        description_entry = tk.Entry(window, width=40)
        description_entry.grid(row=1, column=1, padx=10, pady=5)

        tk.Label(window, text="Precio:").grid(row=2, column=0, sticky=tk.W, padx=10, pady=5)
        price_entry = tk.Entry(window, width=40)
        price_entry.grid(row=2, column=1, padx=10, pady=5)

        tk.Label(window, text="Stock:").grid(row=3, column=0, sticky=tk.W, padx=10, pady=5)
        stock_var = tk.BooleanVar(value=True)
        stock_checkbox = tk.Checkbutton(window, variable=stock_var)
        stock_checkbox.grid(row=3, column=1, padx=10, pady=5, sticky=tk.W)

        tk.Label(window, text="Categoría:").grid(row=4, column=0, sticky=tk.W, padx=10, pady=5)
        category_var = tk.StringVar()
        category_dropdown = ttk.Combobox(window, textvariable=category_var, values=self.get_all_categories(), width=37)
        category_dropdown.grid(row=4, column=1, padx=10, pady=5)

        tk.Label(window, text="Imagen:").grid(row=5, column=0, sticky=tk.W, padx=10, pady=5)
        image_path_var = tk.StringVar()
        image_path_entry = tk.Entry(window, width=30, textvariable=image_path_var)
        image_path_entry.grid(row=5, column=1, padx=10, pady=5, sticky=tk.W)
        browse_button = tk.Button(window, text="Browse", command=lambda: self.browse_image(image_path_var))
        browse_button.grid(row=5, column=2, padx=5, pady=5)

        if product:
            name_entry.insert(tk.END, product.name)
            description_entry.insert(tk.END, product.description)
            price_entry.insert(tk.END, str(product.price))
            stock_var.set(product.stock)
            category_var.set(product.category)
            image_path_var.set(product.image_path)

        window.name_entry = name_entry
        window.description_entry = description_entry
        window.price_entry = price_entry
        window.stock_var = stock_var
        window.category_var = category_var
        window.category_dropdown = category_dropdown
        window.image_path_var = image_path_var

        return window

    def create_window_buttons(self, window: tk.Toplevel, command):
        button_frame = tk.Frame(window)
        button_frame.grid(row=6, column=0, columnspan=3, pady=10)

        tk.Button(button_frame, text="Guardar", command=command).pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="Cancelar", command=window.destroy).pack(side=tk.LEFT, padx=5)

    def get_product_from_entries(self, window: tk.Toplevel) -> Product:
        name = window.name_entry.get().strip()
        description = window.description_entry.get().strip()
        try:
            price = int(window.price_entry.get().strip())
        except ValueError:
            raise ValueError("Precio debe ser un número.")

        stock = window.stock_var.get()
        category = window.category_var.get().strip()
        image_path = self.get_relative_image_path(window.image_path_var.get().strip())

        if not name or not description or not category:
            raise ValueError("Todos los campos deben ser llenados.")

        return Product(name, description, price, stock, category, image_path)

    def browse_image(self, image_path_var: tk.StringVar):
        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png;*.jpg;*.jpeg;*.gif")])
        if file_path:
            relative_path = self.get_relative_image_path(file_path)
            image_path_var.set(relative_path)

    def get_relative_image_path(self, file_path: str) -> str:
        # Convert absolute path to relative path based on IMAGE_BASE_DIR
        if os.path.isabs(file_path):
            return os.path.relpath(file_path, start=IMAGE_BASE_DIR).replace(os.path.sep, '/')
        return file_path.replace(os.path.sep, '/')

    def set_status(self, message: str):
        self.status_var.set(message)

    def show_spinner(self):
        self.spinner_canvas.pack(side=tk.RIGHT, padx=5)
        self.spinner_id = self.spinner_canvas.create_arc(2, 2, 18, 18, start=0, extent=150, outline='black', width=2)
        self.spinner_angle = 0
        self.spin()

    def hide_spinner(self):
        self.spinner_canvas.pack_forget()
        if self.spinner_id:
            self.spinner_canvas.delete(self.spinner_id)
            self.spinner_id = None

    def spin(self):
        if self.spinner_id:
            self.spinner_canvas.itemconfig(self.spinner_id, start=self.spinner_angle)
            self.spinner_angle = (self.spinner_angle + 10) % 360
            self.master.after(100, self.spin)

    def on_tree_click(self, event):
        region = self.tree.identify("region", event.x, event.y)
        if region == "cell":
            column = self.tree.identify_column(event.x)
            if column == "#4":  # 'stock' column
                selected_item = self.tree.selection()
                if selected_item:
                    values = self.tree.item(selected_item)["values"]
                    product = next((p for p in self.products if p.name == values[0]), None)
                    if product:
                        product.stock = not product.stock
                        self.populate_tree()

    def create_category(self):
        new_category = simpledialog.askstring("Crear Categoría", "Ingrese el nombre de la nueva categoría:")
        if new_category:
            new_category = new_category.strip()
            if new_category in self.get_all_categories():
                messagebox.showerror("Error", "La categoría ya existe.")
                return
            self.populate_tree()
            self.update_category_dropdowns()
            self.set_status(f"Categoría '{new_category}' creada.")

    def update_category(self):
        category = simpledialog.askstring("Actualizar Categoría", "Ingrese el nombre de la categoría a actualizar:")
        if category:
            new_category = simpledialog.askstring("Nuevo nombre de categoría", "Ingrese el nuevo nombre de categoría:")
            if new_category:
                for product in self.products:
                    if product.category == category.strip():
                        product.category = new_category.strip()
                self.populate_tree()
                self.update_category_dropdowns()
                self.set_status(f"Categoría '{category}' actualizada a '{new_category}'.")

    def delete_category(self):
        category = simpledialog.askstring("Eliminar Categoría", "Ingrese el nombre de la categoría a eliminar:")
        if category:
            confirm = messagebox.askyesno("Confirmar", f"¿Estás seguro de eliminar la categoría '{category}'?")
            if confirm:
                self.products = [product for product in self.products if product.category != category.strip()]
                self.populate_tree()
                self.update_category_dropdowns()
                self.set_status(f"Categoría '{category}' eliminada.")

if __name__ == "__main__":
    root = tk.Tk()
    product_repository = ProductRepository("product_data.json")
    product_manager = ProductManagerGUI(root, product_repository)
    root.mainloop()
