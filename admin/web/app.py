"""Admin web para El Rincón de Ébano — Streamlit.

Ejecutar con:
    streamlit run admin/web/app.py

Reemplaza el panel tkinter con una UI web que permite:
- Ver, crear, editar y archivar productos
- Gestionar combos (bundles)
- Ver historial de cambios
- Exportar datos al formato JSON que espera el build de Astro
"""

import sys
from pathlib import Path

# Asegurar que admin/ está en el path para importar product_manager
ADMIN_DIR = Path(__file__).resolve().parent.parent
if str(ADMIN_DIR) not in sys.path:
    sys.path.insert(0, str(ADMIN_DIR))

import streamlit as st
from product_manager.data_store import Bundle, BundleItem, DataStore, Product

# ─── Configuración ────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = REPO_ROOT / "data" / "storefront.db"
DATA_DIR = REPO_ROOT / "data"
ASTRO_DATA_DIR = REPO_ROOT / "astro-poc" / "public" / "data"

st.set_page_config(
    page_title="Admin — El Rincón de Ébano",
    page_icon="🛒",
    layout="wide",
)

# ─── Inicializar DataStore ────────────────────────────────────────────────────

@st.cache_resource
def get_store() -> DataStore:
    return DataStore(DB_PATH)

store = get_store()

# ─── Sidebar ──────────────────────────────────────────────────────────────────

st.sidebar.title("🛒 Admin Ébano")
page = st.sidebar.radio(
    "Sección",
    ["📦 Productos", "🎁 Combos", "📋 Historial", "📤 Exportar"],
)

# ─── Página: Productos ───────────────────────────────────────────────────────

if page == "📦 Productos":
    st.title("📦 Productos")

    products = store.get_products(include_archived=False)
    archived_products = store.get_products(include_archived=True)
    archived_only = [p for p in archived_products if p.is_archived]

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Activos", len(products))
    with col2:
        st.metric("Archivados", len(archived_only))
    with col3:
        categories = sorted({p.category for p in products if p.category})
        st.metric("Categorías", len(categories))

    st.divider()

    # Filtro
    search = st.text_input("🔍 Buscar producto", placeholder="Nombre o categoría...")
    category_filter = st.selectbox(
        "Categoría", ["Todas"] + categories, key="product_category_filter"
    )

    filtered = products
    if search:
        q = search.casefold()
        filtered = [
            p for p in filtered
            if q in p.name.casefold() or q in p.category.casefold() or q in p.sku.casefold()
        ]
    if category_filter and category_filter != "Todas":
        filtered = [p for p in filtered if p.category == category_filter]

    st.write(f"Mostrando {len(filtered)} producto(s)")

    # Tabla de productos
    if filtered:
        df_data = [
            {
                "SKU": p.sku,
                "Nombre": p.name[:60],
                "Categoría": p.category,
                "Precio": f"${p.price:,}".replace(",", "."),
                "Stock": "✅" if p.stock else "❌",
                "Desc.": f"${p.discount:,}".replace(",", ".") if p.discount else "",
            }
            for p in filtered
        ]
        st.dataframe(df_data, use_container_width=True, height=400)

    st.divider()

    # Editor de producto
    st.subheader("✏️ Crear / Editar producto")

    edit_sku = st.text_input("SKU del producto a editar (dejar vacío para crear nuevo)", key="edit_sku")

    existing = store.get_product(edit_sku) if edit_sku else None

    with st.form("product_form"):
        name = st.text_input("Nombre *", value=existing.name if existing else "")
        category = st.text_input("Categoría *", value=existing.category if existing else "")
        price = st.number_input("Precio (CLP)", min_value=0, step=100,
                                value=existing.price if existing else 0)
        discount = st.number_input("Descuento (CLP)", min_value=0, step=100,
                                   value=existing.discount if existing else 0)
        description = st.text_area("Descripción", value=existing.description if existing else "")
        brand = st.text_input("Marca", value=existing.brand if existing else "")
        image_path = st.text_input("Ruta de imagen", value=existing.image_path if existing else "")
        stock = st.checkbox("En stock", value=existing.stock if existing else True)
        is_archived = st.checkbox("Archivado", value=existing.is_archived if existing else False)

        submitted = st.form_submit_button("💾 Guardar")
        if submitted:
            if not name or not category:
                st.error("Nombre y categoría son obligatorios.")
            else:
                sku = edit_sku if edit_sku else name.lower().replace(" ", "-")
                product = Product(
                    sku=sku,
                    name=name,
                    category=category,
                    price=price,
                    discount=discount,
                    description=description,
                    brand=brand,
                    image_path=image_path,
                    stock=stock,
                    is_archived=is_archived,
                )
                store.upsert_product(product)
                st.success(f"Producto '{name}' guardado correctamente.")
                st.rerun()

# ─── Página: Combos ──────────────────────────────────────────────────────────

elif page == "🎁 Combos":
    st.title("🎁 Combos listos (Bundles)")

    bundles = store.get_bundles()
    st.metric("Combos", len(bundles))

    if bundles:
        for bundle in bundles:
            with st.expander(f"{bundle.title} ({bundle.bundle_id})"):
                st.write(f"**Descripción:** {bundle.description}")
                if bundle.bundle_price > 0:
                    st.write(f"**Precio fijo:** ${bundle.bundle_price:,}".replace(",", "."))
                else:
                    st.write("**Precio:** Suma de productos individuales")
                st.write("**Productos:**")
                for item in bundle.items:
                    st.write(f"- {item.name} ({item.category})")

                if st.button(f"🗑️ Eliminar {bundle.bundle_id}", key=f"del_{bundle.bundle_id}"):
                    store.delete_bundle(bundle.bundle_id)
                    st.rerun()

    st.divider()

    # Formulario nuevo combo
    st.subheader("✏️ Nuevo combo")
    with st.form("bundle_form"):
        bundle_title = st.text_input("Título *")
        bundle_id = st.text_input("ID (auto-generado si se deja vacío)")
        bundle_desc = st.text_area("Descripción *")
        bundle_price = st.number_input("Precio fijo (0 = suma de productos)", min_value=0, step=500)

        # Selector de productos
        products = store.get_products()
        product_options = [f"{p.category} > {p.name}" for p in products]
        selected = st.multiselect("Productos del combo", product_options)

        if st.form_submit_button("💾 Guardar combo"):
            if not bundle_title:
                st.error("El título es obligatorio.")
            elif not selected:
                st.error("Selecciona al menos un producto.")
            else:
                bid = bundle_id or bundle_title.lower().replace(" ", "-")
                items = []
                for sel in selected:
                    cat, _, name = sel.partition(" > ")
                    items.append(BundleItem(category=cat, name=name))
                bundle = Bundle(
                    bundle_id=bid,
                    title=bundle_title,
                    description=bundle_desc,
                    items=items,
                    bundle_price=bundle_price,
                )
                store.upsert_bundle(bundle)
                st.success(f"Combo '{bundle_title}' guardado.")
                st.rerun()

# ─── Página: Historial ────────────────────────────────────────────────────────

elif page == "📋 Historial":
    st.title("📋 Historial de cambios")

    table_filter = st.selectbox("Filtrar por tabla", ["Todas", "products", "bundles"])
    limit = st.slider("Entradas", 10, 200, 50)

    history = store.get_change_history(
        limit=limit,
        table=None if table_filter == "Todas" else table_filter,
    )

    if history:
        df_data = [
            {
                "Fecha": h["changed_at"],
                "Tabla": h["table_name"],
                "Registro": h["record_id"],
                "Acción": h["action"],
            }
            for h in history
        ]
        st.dataframe(df_data, use_container_width=True)
    else:
        st.info("No hay cambios registrados aún.")

# ─── Página: Exportar ─────────────────────────────────────────────────────────

elif page == "📤 Exportar":
    st.title("📤 Exportar datos para el build")

    st.markdown("""
    Exporta los productos y combos desde SQLite a los archivos JSON que
    espera el build de Astro (`astro-poc/public/data/`).

    Después de exportar, ejecuta `npm run build` para publicar los cambios.
    """)

    col1, col2 = st.columns(2)

    with col1:
        if st.button("📤 Exportar a astro-poc/public/data/", type="primary"):
            try:
                store.export_to_json(ASTRO_DATA_DIR)
                st.success(f"✅ Datos exportados a `{ASTRO_DATA_DIR}`")
                st.info("Ejecuta `npm run build` para reconstruir el sitio.")
            except Exception as e:
                st.error(f"Error al exportar: {e}")

    with col2:
        if st.button("📤 Exportar a data/ (repo root)"):
            try:
                store.export_to_json(DATA_DIR)
                st.success(f"✅ Datos exportados a `{DATA_DIR}`")
            except Exception as e:
                st.error(f"Error al exportar: {e}")

    st.divider()
    st.subheader("🔄 Importar desde JSON existente")

    if st.button("Importar productos desde data/product_data.json"):
        try:
            count = store.import_from_json(DATA_DIR)
            st.success(f"✅ {count} productos importados a SQLite.")
        except FileNotFoundError as e:
            st.error(str(e))
        except Exception as e:
            st.error(f"Error al importar: {e}")
