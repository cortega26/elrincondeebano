import json
import tkinter as tk
import os
from tkinter import ttk, messagebox, simpledialog

class Product:
    def __init__(self, name, description, price, stock, category):
        self.name = name
        self.description = description
        self.price = price
        self.stock = stock
        self.category = category

class ProductRepository:
    def __init__(self, file_path):
        self.file_path = os.path.join('_products', file_path)

    def load_products(self):
        try:
            with open(self.file_path, "r") as file:
                products_data = json.load(file)
                return [Product(**product) for product in products_data]
        except FileNotFoundError:
            return []

    def save_products(self, products):
        products_data = [product.__dict__ for product in products]
        with open(self.file_path, "w") as file:
            json.dump(products_data, file, indent=2)

class ProductManagerGUI:
    def __init__(self, master, product_repository):
        self.master = master
        self.product_repository = product_repository
        self.products = []
        self.setup_gui()
        self.load_products()

    def setup_gui(self):
        self.master.title("Administrador de Productos")

        self.tree = ttk.Treeview(self.master, columns=("name", "description", "price", "stock", "category"))
        self.tree.heading("#0", text="ID")
        self.tree.column("#0", width=50, stretch=tk.NO)
        self.tree.heading("name", text="Nombre")
        self.tree.heading("description", text="Descripción")
        self.tree.heading("price", text="Precio")
        self.tree.heading("stock", text="Stock")
        self.tree.heading("category", text="Categoría")
        self.tree.pack(fill=tk.BOTH, expand=True)

        self.search_entry = tk.Entry(self.master)
        self.search_entry.pack(side=tk.LEFT, padx=5, pady=5)
        self.search_button = tk.Button(self.master, text="Buscar", command=self.search_products)
        self.search_button.pack(side=tk.LEFT)

        self.sort_var = tk.StringVar(value="name")
        self.sort_dropdown = ttk.Combobox(self.master, textvariable=self.sort_var, values=["name", "price", "stock", "category"])
        self.sort_dropdown.pack(side=tk.LEFT, padx=5)
        self.sort_button = tk.Button(self.master, text="Ordenar", command=self.sort_products)
        self.sort_button.pack(side=tk.LEFT)

        self.add_button = tk.Button(self.master, text="Agregar", command=self.add_product)
        self.add_button.pack(side=tk.RIGHT, padx=5, pady=5)
        self.edit_button = tk.Button(self.master, text="Editar", command=self.edit_product)
        self.edit_button.pack(side=tk.RIGHT)
        self.delete_button = tk.Button(self.master, text="Eliminar", command=self.delete_product)
        self.delete_button.pack(side=tk.RIGHT)
        self.save_button = tk.Button(self.master, text="Guardar", command=self.save_products)
        self.save_button.pack(side=tk.RIGHT)

    def load_products(self):
        self.products = self.product_repository.load_products()
        self.populate_tree()

    def populate_tree(self):
        self.tree.delete(*self.tree.get_children())
        for index, product in enumerate(self.products, start=1):
            self.tree.insert("", "end", text=str(index), values=(product.name, product.description, product.price, product.stock, product.category))

    def save_products(self):
        self.product_repository.save_products(self.products)
        messagebox.showinfo("Éxito", "Los productos se han guardado correctamente.")

    def add_product(self):
        add_window = tk.Toplevel(self.master)
        add_window.title("Agregar Producto")
        add_window.geometry("400x350")

        tk.Label(add_window, text="Nombre:").grid(row=0, column=0, sticky=tk.W, padx=10, pady=5)
        name_entry = tk.Entry(add_window, width=40)
        name_entry.grid(row=0, column=1, padx=10, pady=5)

        tk.Label(add_window, text="Descripción:").grid(row=1, column=0, sticky=tk.W, padx=10, pady=5)
        description_entry = tk.Entry(add_window, width=40)
        description_entry.grid(row=1, column=1, padx=10, pady=5)

        tk.Label(add_window, text="Precio:").grid(row=2, column=0, sticky=tk.W, padx=10, pady=5)
        price_entry = tk.Entry(add_window, width=40)
        price_entry.grid(row=2, column=1, padx=10, pady=5)

        tk.Label(add_window, text="Stock:").grid(row=3, column=0, sticky=tk.W, padx=10, pady=5)
        stock_var = tk.BooleanVar(value=True)
        stock_checkbox = tk.Checkbutton(add_window, variable=stock_var)
        stock_checkbox.grid(row=3, column=1, padx=10, pady=5, sticky=tk.W)

        tk.Label(add_window, text="Categoría:").grid(row=4, column=0, sticky=tk.W, padx=10, pady=5)
        category_var = tk.StringVar()
        category_dropdown = ttk.Combobox(add_window, textvariable=category_var, values=self.get_categories(), width=37)
        category_dropdown.grid(row=4, column=1, padx=10, pady=5)

        button_frame = tk.Frame(add_window)
        button_frame.grid(row=5, column=0, columnspan=2, pady=10)

        def add():
            name = name_entry.get()
            description = description_entry.get()
            price = float(price_entry.get())
            stock = stock_var.get()
            category = category_var.get()

            product = Product(name, description, price, stock, category)
            self.products.append(product)
            self.populate_tree()
            add_window.destroy()

        def edit_category():
            category = category_var.get()
            if category:
                new_category = tk.simpledialog.askstring("Editar Categoría", "Ingrese el nuevo nombre de categoría:", initialvalue=category)
                if new_category:
                    for product in self.products:
                        if product.category == category:
                            product.category = new_category
                    category_dropdown['values'] = self.get_categories()
                    category_var.set(new_category)

        def create_category():
            new_category = tk.simpledialog.askstring("Crear Categoría", "Ingrese el nombre de la nueva categoría:")
            if new_category:
                category_dropdown['values'] = self.get_categories() + [new_category]
                category_var.set(new_category)

        def delete_category():
            category = category_var.get()
            if category:
                confirm = messagebox.askyesno("Confirmar", f"¿Estás seguro de eliminar la categoría '{category}'?")
                if confirm:
                    self.products = [product for product in self.products if product.category != category]
                    category_dropdown['values'] = self.get_categories()
                    category_var.set("")

        tk.Button(button_frame, text="Agregar", command=add).pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="Editar Categoría", command=edit_category).pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="Crear Categoría", command=create_category).pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="Eliminar Categoría", command=delete_category).pack(side=tk.LEFT, padx=5)

    def edit_product(self):
        selected_item = self.tree.focus()
        if not selected_item:
            messagebox.showwarning("Advertencia", "Por favor, selecciona un producto para editar.")
            return

        values = self.tree.item(selected_item)["values"]
        product = next((p for p in self.products if p.name == values[0]), None)

        if product:
            edit_window = tk.Toplevel(self.master)
            edit_window.title("Editar Producto")

            tk.Label(edit_window, text="Nombre:").grid(row=0, column=0, sticky=tk.W)
            name_entry = tk.Entry(edit_window)
            name_entry.insert(tk.END, product.name)
            name_entry.grid(row=0, column=1)

            tk.Label(edit_window, text="Descripción:").grid(row=1, column=0, sticky=tk.W)
            description_entry = tk.Entry(edit_window)
            description_entry.insert(tk.END, product.description)
            description_entry.grid(row=1, column=1)

            tk.Label(edit_window, text="Precio:").grid(row=2, column=0, sticky=tk.W)
            price_entry = tk.Entry(edit_window)
            price_entry.insert(tk.END, str(product.price))
            price_entry.grid(row=2, column=1)

            tk.Label(edit_window, text="Stock:").grid(row=3, column=0, sticky=tk.W)
            stock_var = tk.BooleanVar(value=product.stock)
            stock_checkbox = tk.Checkbutton(edit_window, variable=stock_var)
            stock_checkbox.grid(row=3, column=1)

            tk.Label(edit_window, text="Categoría:").grid(row=4, column=0, sticky=tk.W)
            category_entry = tk.Entry(edit_window)
            category_entry.insert(tk.END, product.category)
            category_entry.grid(row=4, column=1)

            def update():
                product.name = name_entry.get()
                product.description = description_entry.get()
                product.price = int(price_entry.get())
                product.stock = stock_var.get()
                product.category = category_entry.get()

                self.populate_tree()
                edit_window.destroy()

            tk.Button(edit_window, text="Actualizar", command=update).grid(row=5, column=0, columnspan=2, pady=5)

    def delete_product(self):
        selected_item = self.tree.focus()
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

    def search_products(self):
        query = self.search_entry.get().lower()
        filtered_products = [p for p in self.products if query in p.name.lower() or query in p.description.lower()]
        self.tree.delete(*self.tree.get_children())
        for index, product in enumerate(filtered_products, start=1):
            self.tree.insert("", "end", text=str(index), values=(product.name, product.description, product.price, product.stock, product.category))

    def sort_products(self):
        sort_key = self.sort_var.get()
        self.products.sort(key=lambda p: getattr(p, sort_key), reverse=True)
        self.populate_tree()

    def get_categories(self):
        categories = set(product.category for product in self.products)
        return sorted(categories)

if __name__ == "__main__":
    root = tk.Tk()
    product_repository = ProductRepository("product_data.json")
    product_manager = ProductManagerGUI(root, product_repository)
    root.mainloop()