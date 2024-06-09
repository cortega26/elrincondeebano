const fs = require('fs');
const path = require('path');

// Ensure the path is correct
const productsFile = path.resolve(__dirname, '../../_products/products.json');
console.log('Products file path:', productsFile);

exports.handler = async function(event, context) {
    if (!event || typeof event !== 'object') {
        console.error('Invalid event data');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid event data' }),
        };
    }
    try {
        console.log('Attempting to read products file');
        const productsData = await fs.promises.readFile(productsFile, 'utf8');
        console.log('Products data:', productsData);
        try {
            const products = JSON.parse(productsData);
            if (!Array.isArray(products)) {
                throw new Error('Products data is not in the expected format');
            }
        } catch (jsonError) {
            console.error('Error parsing JSON:', jsonError);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to parse JSON data. Error: ' + jsonError.message }),
            };
        }
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
            body: JSON.stringify({ error: 'Failed to load products. Error: ' + error.message }),
        };
    }
};
