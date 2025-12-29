import pytest
from models import Product, InvalidPriceError, InvalidDiscountError, InvalidImagePathError
from test_support import require

class TestProductModels:
    def test_product_creation_valid(self):
        """Test creating a valid product."""
        p = Product(
            name="Test Product",
            description="A valid product",
            price=1000,
            category="Test",
            image_path="assets/images/valid.jpg"
        )
        require(p.name == "Test Product", 'Expected name to be set')
        require(p.price == 1000, 'Expected price to be set')
        require(p.discounted_price == 1000, 'Expected discounted price to match')

    def test_price_validation(self):
        """Test price validation logic."""
        with pytest.raises(InvalidPriceError):
            Product(name="P", description="D", price=-100)
        
        with pytest.raises(InvalidPriceError):
            Product(name="P", description="D", price=0)

    def test_discount_validation(self):
        """Test discount rules."""
        p = Product(name="P", description="D", price=1000)
        
        # Valid discount
        p.apply_discount(10)
        require(p.discount == 100, 'Expected discount to be applied')
        require(p.discounted_price == 900, 'Expected discounted price to reflect discount')

        # Invalid discount > price
        with pytest.raises(InvalidDiscountError):
            Product(name="P", description="D", price=100, discount=200)

    def test_image_path_validation(self):
        """Test image path security/format."""
        # Valid
        Product(name="P", description="D", price=100, image_path="assets/images/test.webp")
        
        # Invalid start
        with pytest.raises(InvalidImagePathError):
            Product(name="P", description="D", price=100, image_path="images/fail.png")
            
        # Invalid extension
        with pytest.raises(InvalidImagePathError):
            Product(name="P", description="D", price=100, image_path="assets/images/fail.exe")

    def test_identity_key(self):
        """Test canonical identity generation."""
        p1 = Product(name="  My Product  ", description=" DESC ", price=1)
        p2 = Product(name="my product", description="desc", price=2)
        
        require(p1.identity_key() == p2.identity_key(), 'Expected identity key to normalize')
