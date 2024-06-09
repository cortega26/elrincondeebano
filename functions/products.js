const fs = require('fs');
const path = require('path');

// Adjust path to ensure it correctly points to the _products directory at the root level
const productsFile = path.resolve(__dirname, '../../_products/products.json');
console.log('Products file path:', productsFile);

// Function to list directory contents
function listDirectoryContents(dir) {
    return fs.readdirSync(dir).map(file => {
        const fullPath = path.join(dir, file);
        const isDirectory = fs.lstatSync(fullPath).isDirectory();
        return {
            name: file,
            path: fullPath,
            type: isDirectory ? 'directory' : 'file'
        };
    });
}

exports.handler = async function(event, context) {
    try {
        console.log('Attempting to read products file at:', productsFile);
        
        // List root directory contents
        const rootDirContents = listDirectoryContents(path.resolve(__dirname, '../../'));
        console.log('Root directory contents:', rootDirContents);

        // Check if the file exists before reading it
        if (!fs.existsSync(productsFile)) {
            throw new Error('File not found: ' + productsFile);
        }

        const productsData = fs.readFileSync(productsFile, 'utf8');
        console.log('Products data:', productsData);

        // Validate the JSON format
        let products;
        try {
            products = JSON.parse(productsData);
        } catch (jsonError) {
            throw new Error('Invalid JSON format: ' + jsonError.message);
        }

        console.log('Parsed products:', products);

        return {
            statusCode: 200,
            body: JSON.stringify(products),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    } catch (error) {
        console.error('Error loading products:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to load products', details: error.message }),
        };
    }
};
