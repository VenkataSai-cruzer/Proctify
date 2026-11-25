// ============================================================
// SecureAssess Server — Database Seed
// Creates the Lab Host teacher account and stores the initial
// faculty registration PIN so subsequent teachers can register.
//
// Run: yarn db:seed
//
// CHANGE THESE CREDENTIALS IMMEDIATELY AFTER FIRST INSTALL:
//   Email:    admin@secureassess.local
//   Password: SecureAssess@2024
//   PIN:      seed-pin-change-me  (shown in console below)
// ============================================================

import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./utils/prismaClient";

const SEED_EMAIL    = "admin@secureassess.local";
const SEED_PASSWORD = "SecureAssess@2024";
const SEED_PIN      = process.env.FACULTY_REGISTRATION_PIN ?? "SecureAssess-PIN-2024";

async function main() {
  console.log("Seeding SecureAssess database...\n");

  // ── Lab Host account ──────────────────────────────────────
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const teacher = await prisma.teacher.upsert({
    where: { email: SEED_EMAIL },
    update: { isLabHost: true },
    create: { name: "Admin Teacher", email: SEED_EMAIL, passwordHash, isLabHost: true },
  });
  console.log(`✓ Lab Host: ${teacher.email}`);
  console.log(`  Password: ${SEED_PASSWORD}  ← CHANGE THIS`);

  // ── Faculty registration PIN ──────────────────────────────
  const pinHash = await bcrypt.hash(SEED_PIN, 10);
  await prisma.appSetting.upsert({
    where:  { key: "facultyPin" },
    update: { value: pinHash },
    create: { key: "facultyPin", value: pinHash },
  });
  console.log(`✓ Faculty Registration PIN stored`);
  console.log(`  PIN: ${SEED_PIN}  ← CHANGE THIS (via Settings → Change PIN)`);

  // ── Allowed subnets ───────────────────────────────────────
  for (const { cidr, label } of [
    { cidr: "127.0.0.0/8",    label: "Localhost (development)" },
    { cidr: "192.168.0.0/16", label: "Local LAN (192.168.x.x)" },
  ]) {
    await prisma.allowedSubnet.upsert({
      where: { cidr }, update: {}, create: { cidr, label },
    });
  }
  console.log("✓ Default allowed subnets seeded");

  // ── Sample lab machines SYS-01 to SYS-05 ─────────────────
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

  console.log("\n⚠  IMPORTANT: Change the seed password and PIN before going live.");
  console.log("   - Login → Settings → Change Password");
  console.log("   - Login → Settings → Change Faculty Registration PIN\n");
  console.log("Seed complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
