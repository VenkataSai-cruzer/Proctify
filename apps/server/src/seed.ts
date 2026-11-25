// ============================================================
// SecureAssess Server — Database Seed
// Creates a default teacher account and lab subnet
// Run: yarn db:seed
// ============================================================

import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./utils/prismaClient";

async function main() {
  console.log("Seeding SecureAssess database...");

  // Default teacher account
  const passwordHash = await bcrypt.hash("SecureAssess@2024", 12);
  const teacher = await prisma.teacher.upsert({
    where: { email: "admin@secureassess.local" },
    update: {},
    create: {
      name: "Admin Teacher",
      email: "admin@secureassess.local",
      passwordHash,
    },
  });
  console.log(`✓ Teacher: ${teacher.email} (password: SecureAssess@2024)`);

  // Default allowed subnet (localhost for dev)
  await prisma.allowedSubnet.upsert({
    where: { cidr: "127.0.0.0/8" },
    update: {},
    create: { cidr: "127.0.0.0/8", label: "Localhost (development)" },
  });
  await prisma.allowedSubnet.upsert({
    where: { cidr: "192.168.0.0/16" },
    update: {},
    create: { cidr: "192.168.0.0/16", label: "Local LAN (192.168.x.x)" },
  });
  console.log("✓ Default allowed subnets seeded");

  // Sample lab machines SYS-01 to SYS-05
  for (let i = 1; i <= 5; i++) {
    const sysNo = `SYS-0${i}`;
    await prisma.labMachine.upsert({
      where: { systemNo: sysNo },
      update: {},
      create: {
        systemNo: sysNo,
        machineName: `Lab PC ${i}`,
        macAddress: `00:11:22:33:44:${String(i).padStart(2, "0")}`,
        ipAddress: `192.168.1.${100 + i}`,
        hardwareToken: `dev-token-sys-0${i}-secureassess-2024`.padEnd(32, "0").slice(0, 32),
        isActive: true,
        row: Math.floor((i - 1) / 5),
        col: (i - 1) % 5,
      },
    });
  }
  console.log("✓ Sample lab machines seeded (SYS-01 to SYS-05)");

  console.log("\nSeed complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
