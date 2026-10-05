/**
 * Development-only demo data: a company name and one product, so the bot can be tried
 * immediately. Real products are created by admins from the bot (⚙️ Boshqaruv → 📦 Mahsulotlar).
 * Idempotent; refuses to run in production.
 *
 *   npm run seed:demo -- --company "Toza Suv" --product "18.9 L ichimlik suvi" --price 15000
 */
import { PrismaClient } from '@prisma/client';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('seed:demo must not run in production');
  const prisma = new PrismaClient();
  try {
    const company = arg('company', 'Demo Suv');
    const name = arg('product', '18.9 L ichimlik suvi');
    const price = Number(arg('price', '15000'));

    const existingCompany = await prisma.setting.findUnique({ where: { key: 'company_name' } });
    if (!existingCompany) await prisma.setting.create({ data: { key: 'company_name', value: company } });

    if ((await prisma.product.count()) === 0) {
      await prisma.product.create({
        data: { name, price, description: 'Toza ichimlik suvi. Bo‘sh idishlarni kuryer olib ketadi.', sortOrder: 10 },
      });
      console.log(`Created demo product "${name}" (${price})`);
    } else {
      console.log('Products already exist — left untouched');
    }
    console.log(`company_name = ${existingCompany?.value ?? company}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
