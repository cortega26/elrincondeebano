import pytest
from unittest.mock import Mock, MagicMock
from services import ProductService, Product, DuplicateProductError, ProductNotFoundError
from repositories import ProductRepositoryProtocol

class FakeRepository:
    def __init__(self):
        self._products = []
        self.save_products = Mock(wraps=self._save) # Spy on save calls

    def load_products(self):
        return list(self._products)

    def _save(self, products, metadata=None):
        self._products = list(products)

@pytest.fixture
def mock_repo():
    return FakeRepository()

@pytest.fixture
def service(mock_repo):
    svc = ProductService(repository=mock_repo)
    # Ensure indexes are built initially
    svc._rebuild_indexes()
    return svc

class TestProductService:
    def test_add_product_success(self, service, mock_repo):
        """Test successful product addition."""
        p = Product(name="New", description="Desc", price=100)
        service.add_product(p)
        
        assert len(service.get_all_products()) == 1
        mock_repo.save_products.assert_called_once()

    def test_add_duplicate_product(self, service):
        """Test duplicate detection."""
        p1 = Product(name="Same", description="Same", price=100)
        service.add_product(p1)
        
        p2 = Product(name="Same", description="Same", price=200)
        with pytest.raises(DuplicateProductError):
            service.add_product(p2)

    def test_update_product(self, service):
        """Test updating a product."""
        original = Product(name="Orig", description="Desc", price=100)
        service.add_product(original)
        
        updated = Product(name="Orig", description="Desc", price=150)
        service.update_product(original.name, updated, original.description)
        
        stored = service.get_product_by_name("Orig")
        assert stored.price == 150

    def test_delete_product(self, service):
        """Test deletion."""
        p = Product(name="Del", description="Desc", price=100)
        service.add_product(p)
        
        assert service.delete_product(p.name, p.description) is True
        assert len(service.get_all_products()) == 0

    def test_search_products(self, service):
        """Test search functionality."""
        p1 = Product(name="Apple Pie", description="Sweet", price=10)
        p2 = Product(name="Banana Bread", description="Sweet", price=10)
        service.add_product(p1)
        service.add_product(p2)
        
        results = service.search_products("Apple")
        assert len(results) == 1
        assert results[0].name == "Apple Pie"
        
        results = service.search_products("Sweet")
        assert len(results) == 2
