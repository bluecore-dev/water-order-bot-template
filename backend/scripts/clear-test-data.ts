/**
 * Cut-over helper: removes everything customers produced while testing (orders, users,
 * addresses, sessions, amoCRM queue) and restarts order numbers at #1001.
 * Keeps products, settings, admins and amoCRM credentials.
 *
 * Run BEFORE connecting amoCRM / switching to the client's bot token, otherwise test orders
 * would be sent to the client's CRM.
 *
 *   npm run data:clear-test            → dry run, prints what would be deleted
 *   npm run data:clear-test -- --yes   → deletes
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const counts = {
      orders: await prisma.order.count(),
      users: await prisma.user.count(),
      addresses: await prisma.address.count(),
      sessions: await prisma.botSession.count(),
      amocrmQueue: await prisma.amocrmSync.count(),
    };
    const db = new URL(process.env.DATABASE_URL ?? 'postgresql://unknown/unknown').pathname.slice(1);
    console.log(`Database "${db}":`, counts);

    if (!process.argv.includes('--yes')) {
      console.log('Dry run. Re-run with --yes to delete.');
      return;
    }

    await prisma.$transaction([
      prisma.amocrmSync.deleteMany(),
      prisma.orderItem.deleteMany(),
      prisma.order.deleteMany(),
      prisma.address.deleteMany(),
      prisma.botSession.deleteMany(),
      prisma.user.deleteMany(),
      prisma.$executeRawUnsafe('ALTER SEQUENCE "Order_orderNumber_seq" RESTART WITH 1001'),
    ]);
    console.log('Deleted. Next order number: #1001. Products, settings and admins were kept.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
