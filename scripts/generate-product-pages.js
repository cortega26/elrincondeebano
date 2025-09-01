import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateStableId(product) {
    const baseString = `${product.name}-${product.category}`.toLowerCase();
    let hash = 0;
    for (let i = 0; i < baseString.length; i++) {
        const char = baseString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return `pid-${Math.abs(hash)}`;
}

async function generateProductPages() {
    console.log('🚀 Generating individual product pages...');

    const dataPath = path.join(__dirname, '..', '_products', 'product_data.json');
    if (!fs.existsSync(dataPath)) {
        console.error('❌ Product data file not found:', dataPath);
        return;
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const products = (data.products || data).filter(p => p.stock === true);

    const templatePath = path.join(__dirname, '..', 'templates', 'product.ejs');
    const template = fs.readFileSync(templatePath, 'utf8');

    const outputDir = path.join(__dirname, '..', 'productos');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    let generatedCount = 0;

    for (const product of products) {
        try {
            product.slug = product.name
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

            const html = ejs.render(template, { product, generateStableId });
            const outputPath = path.join(outputDir, `${product.slug}.html`);
            fs.writeFileSync(outputPath, html);
            generatedCount++;
        } catch (error) {
            console.warn(`⚠️  Failed to generate page for ${product.name}:`, error.message);
        }
    }

    console.log(`✅ Generated ${generatedCount} product pages in /productos/`);
}

if (process.argv[1] === __filename) {
    generateProductPages();
}

export default generateProductPages;
