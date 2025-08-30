const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const templatePath = path.join(__dirname, 'templates', 'category.ejs');
const template = fs.readFileSync(templatePath, 'utf8');

const pages = [
  { slug: 'aguas', name: 'Aguas', description: 'Explora nuestra selección de aguas en El Rincón de Ébano.' },
  { slug: 'bebidas', name: 'Bebidas', description: 'Explora nuestra selección de bebidas en El Rincón de Ébano.' },
  { slug: 'carnesyembutidos', name: 'Carnes y Embutidos', description: 'Descubre nuestra selección premium de embutidos y afines en El Rincón de Ébano. Encuentra opciones frescas y de alta calidad.' },
  { slug: 'cervezas', name: 'Cervezas', description: 'Explora nuestra selección de cervezas en El Rincón de Ébano. Encuentra refrescantes opciones para todos los gustos.' },
  { slug: 'chocolates', name: 'Chocolates', description: 'Explora nuestra selección de chocolates en El Rincón de Ébano.' },
  { slug: 'despensa', name: 'Despensa', description: 'Explora nuestra selección de productos de despensa en El Rincón de Ébano.' },
  { slug: 'energeticaseisotonicas', name: 'Energéticas e Isotónicas', description: 'Explora nuestra selección de bebidas energéticas y isotónicas en El Rincón de Ébano.' },
  { slug: 'espumantes', name: 'Espumantes', description: 'Explora nuestra selección de espumantes en El Rincón de Ébano.' },
  { slug: 'juegos', name: 'Juegos', description: 'Explora nuestra selección de juegos de mesa en El Rincón de Ébano.' },
  { slug: 'jugos', name: 'Jugos', description: 'Explora nuestra selección de jugos en El Rincón de Ébano.' },
  { slug: 'lacteos', name: 'Lácteos', description: 'Explora nuestra selección de productos lácteos en El Rincón de Ébano.' },
  { slug: 'limpiezayaseo', name: 'Limpieza y Aseo', description: 'Explora nuestra selección de productos de limpieza y aseo en El Rincón de Ébano.' },
  { slug: 'llaveros', name: 'Llaveros', description: 'Explora nuestra selección de llaveros en El Rincón de Ébano.' },
  { slug: 'mascotas', name: 'Mascotas', description: 'Explora nuestra sección de mascotas en El Rincón de Ébano.' },
  { slug: 'piscos', name: 'Piscos', description: 'Explora nuestra selección de piscos en El Rincón de Ébano.' },
  { slug: 'snacksdulces', name: 'Snacks Dulces', description: 'Explora nuestra selección de Snacks Dulces en El Rincón de Ébano.' },
  { slug: 'snackssalados', name: 'Snacks Salados', description: 'Explora nuestra selección de Snacks Salados en El Rincón de Ébano.' },
  { slug: 'software', name: 'Software', description: 'Explora nuestra sección de software en El Rincón de Ébano.' },
  { slug: 'vinos', name: 'Vinos', description: 'Explora nuestra amplia selección de vinos en El Rincón de Ébano y encuentra la vid que satisfaga tu paladar.' },
];

pages.forEach(page => {
  const html = ejs.render(template, { categoryName: page.name, description: page.description, slug: page.slug });
  const outputPath = path.join(__dirname, 'pages', `${page.slug}.html`);
  fs.writeFileSync(outputPath, html);
});
