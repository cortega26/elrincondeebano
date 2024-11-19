// website-testing.js

class WebsiteTestSuite {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.tests = [];
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            errors: []
        };
    }

    async runAllTests() {
        console.log('🚀 Starting website tests...\n');
        const startTime = performance.now();

        // Core functionality tests
        await this.testHomePage();
        await this.testProductLoading();
        await this.testCategoryPages();
        await this.testNavigation();
        await this.testCart();
        await this.testServiceWorker();
        await this.testAssets();
        await this.testPerformance();

        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        this.printResults(duration);
        this.sendNotification();
    }

    async testHomePage() {
        try {
            const response = await fetch(this.baseUrl);
            this.addResult(
                'Homepage Loading',
                response.ok,
                'Homepage should be accessible',
                response.status
            );

            const html = await response.text();
            
            // Check critical elements
            this.addResult(
                'Homepage Content - Navbar',
                html.includes('navbar-container'),
                'Navbar should be present'
            );

            this.addResult(
                'Homepage Content - Product Container',
                html.includes('product-container'),
                'Product container should be present'
            );

            this.addResult(
                'Homepage Content - Footer',
                html.includes('footer-container'),
                'Footer should be present'
            );

        } catch (error) {
            this.addResult('Homepage Loading', false, 'Homepage test failed', error);
        }
    }

    async testProductLoading() {
        try {
            const response = await fetch(`${this.baseUrl}_products/product_data.json`);
            const data = await response.json();

            this.addResult(
                'Product Data Structure',
                data && data.products && Array.isArray(data.products),
                'Product data should be properly structured'
            );

            this.addResult(
                'Product Data Content',
                data.products.length > 0,
                'Product data should not be empty'
            );

            // Test required product fields
            const requiredFields = ['name', 'description', 'price', 'category', 'image_path'];
            const hasAllFields = data.products.every(product => 
                requiredFields.every(field => product.hasOwnProperty(field))
            );

            this.addResult(
                'Product Data Fields',
                hasAllFields,
                'All products should have required fields'
            );

        } catch (error) {
            this.addResult('Product Loading', false, 'Product loading test failed', error);
        }
    }

    async testCategoryPages() {
        const categories = [
            'bebidas', 'carnesyembutidos', 'cervezas', 'chocolates',
            'despensa', 'espumantes', 'juegos', 'jugos', 'lacteos',
            'limpiezayaseo', 'llaveros', 'mascotas', 'piscos',
            'snacksdulces', 'snackssalados', 'software', 'vinos'
        ];

        for (const category of categories) {
            try {
                const response = await fetch(`${this.baseUrl}pages/${category}.html`);
                this.addResult(
                    `Category Page - ${category}`,
                    response.ok,
                    `${category} page should be accessible`,
                    response.status
                );
            } catch (error) {
                this.addResult(`Category Page - ${category}`, false, `${category} page test failed`, error);
            }
        }
    }

    async testNavigation() {
        try {
            const response = await fetch(`${this.baseUrl}pages/navbar.html`);
            const html = await response.text();

            // Check navigation links
            const navItems = [
                'alimentosDropdown', 'bebidasDropdown', 'snacksDropdown', 'otrosDropdown'
            ];

            navItems.forEach(item => {
                this.addResult(
                    `Navigation - ${item}`,
                    html.includes(item),
                    `Navigation item ${item} should be present`
                );
            });

        } catch (error) {
            this.addResult('Navigation', false, 'Navigation test failed', error);
        }
    }

    async testCart() {
        try {
            // Test cart functionality
            const cartFunctions = [
                'addToCart',
                'removeFromCart',
                'updateQuantity',
                'emptyCart',
                'saveCart',
                'renderCart'
            ];

            const scriptResponse = await fetch(`${this.baseUrl}assets/js/script.js`);
            const scriptContent = await scriptResponse.text();

            cartFunctions.forEach(func => {
                this.addResult(
                    `Cart Function - ${func}`,
                    scriptContent.includes(func),
                    `Cart function ${func} should be defined`
                );
            });

        } catch (error) {
            this.addResult('Cart Functionality', false, 'Cart test failed', error);
        }
    }

    async testServiceWorker() {
        try {
            const response = await fetch(`${this.baseUrl}service-worker.js`);
            this.addResult(
                'Service Worker',
                response.ok,
                'Service worker should be accessible',
                response.status
            );
        } catch (error) {
            this.addResult('Service Worker', false, 'Service worker test failed', error);
        }
    }

    async testAssets() {
        const criticalAssets = [
            'assets/css/style.css',
            'assets/js/script.js',
            'assets/images/web/logo.webp',
            'assets/images/web/favicon.ico'
        ];

        for (const asset of criticalAssets) {
            try {
                const response = await fetch(`${this.baseUrl}${asset}`);
                this.addResult(
                    `Asset Loading - ${asset}`,
                    response.ok,
                    `Asset ${asset} should be accessible`,
                    response.status
                );
            } catch (error) {
                this.addResult(`Asset Loading - ${asset}`, false, `Asset ${asset} test failed`, error);
            }
        }
    }

    async testPerformance() {
        try {
            const startTime = performance.now();
            const response = await fetch(this.baseUrl);
            const endTime = performance.now();
            const loadTime = endTime - startTime;

            this.addResult(
                'Performance - Load Time',
                loadTime < 3000, // 3 seconds threshold
                'Page should load in under 3 seconds',
                `${loadTime.toFixed(2)}ms`
            );

        } catch (error) {
            this.addResult('Performance', false, 'Performance test failed', error);
        }
    }

    addResult(testName, passed, description, error = null) {
        this.tests.push({
            name: testName,
            passed,
            description,
            error
        });

        if (passed) {
            this.results.passed++;
        } else {
            this.results.failed++;
            this.results.errors.push({
                test: testName,
                error: error || 'Test failed'
            });
        }
        this.results.total++;
    }

    printResults(duration) {
        console.log('\n📊 Test Results:');
        console.log('================');
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`Passed: ${this.results.passed} ✅`);
        console.log(`Failed: ${this.results.failed} ❌`);
        console.log(`Duration: ${duration}s\n`);

        if (this.results.failed > 0) {
            console.log('❌ Failed Tests:');
            console.log('===============');
            this.results.errors.forEach(error => {
                console.log(`Test: ${error.test}`);
                console.log(`Error: ${error.error}\n`);
            });
        }
    }

    async sendNotification() {
        if (this.results.failed > 0) {
            // You can implement various notification methods here:
            // 1. Email notification
            // 2. Slack webhook
            // 3. GitHub issue
            // 4. Custom webhook
            // Example:
            // await fetch('your-notification-endpoint', {
            //     method: 'POST',
            //     body: JSON.stringify(this.results)
            // });
            
            console.log('🔔 Notifications would be sent for failed tests');
        }
    }
}

// Usage example:
async function runTests() {
    const tester = new WebsiteTestSuite('https://elrincondeebano.com/');
    await tester.runAllTests();
}

// Run tests
if (typeof window === 'undefined') {
    // Node.js environment
    runTests();
} else {
    // Browser environment
    window.addEventListener('load', runTests);
}

// Export for usage in Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebsiteTestSuite;
}
