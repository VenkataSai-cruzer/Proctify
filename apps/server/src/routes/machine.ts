// ============================================================
// SecureAssess — Lab Machine Registration Routes
// ============================================================

import { Router } from "express";
import { prisma } from "../utils/prismaClient";
import { requireTeacher, type AuthedRequest } from "../middleware/auth";
import { LabMachineSchema } from "@secureassess/shared";
import { randomBytes } from "crypto";

export const machineRouter = Router();
machineRouter.use(requireTeacher);

// GET /api/machine  — list all registered machines
machineRouter.get("/", async (_req, res) => {
  const machines = await prisma.labMachine.findMany({ orderBy: { systemNo: "asc" } });
  res.json({ machines });
});

// POST /api/machine  — register a new lab machine
machineRouter.post("/", async (req, res) => {
  const parsed = LabMachineSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }

  // Auto-generate hardware token if not provided
  const hardwareToken = parsed.data.hardwareToken || randomBytes(24).toString("hex");

  const machine = await prisma.labMachine.upsert({
    where: { systemNo: parsed.data.systemNo },
    update: { ...parsed.data, hardwareToken },
    create: { ...parsed.data, hardwareToken },
  });
  res.status(201).json({ machine });
});

// PATCH /api/machine/:systemNo
machineRouter.patch("/:systemNo", async (req, res) => {
  const machine = await prisma.labMachine.findUnique({ where: { systemNo: req.params.systemNo } });
  if (!machine) { res.status(404).json({ error: "Machine not found" }); return; }

  const updated = await prisma.labMachine.update({
    where: { systemNo: req.params.systemNo },
    data: req.body,
  });
  res.json({ machine: updated });
});

// DELETE /api/machine/:systemNo
machineRouter.delete("/:systemNo", async (req, res) => {
  const machine = await prisma.labMachine.findUnique({ where: { systemNo: req.params.systemNo } });
  if (!machine) { res.status(404).json({ error: "Machine not found" }); return; }
  await prisma.labMachine.delete({ where: { systemNo: req.params.systemNo } });
  res.json({ deleted: true });
});

// GET /api/machine/subnets  — get allowed subnets
machineRouter.get("/subnets", async (_req, res) => {
  const subnets = await prisma.allowedSubnet.findMany();
  res.json({ subnets });
});

// POST /api/machine/subnets  — add a subnet
machineRouter.post("/subnets", async (req, res) => {
  const { cidr, label } = req.body as { cidr: string; label?: string };
  if (!cidr) { res.status(400).json({ error: "cidr required" }); return; }
  const subnet = await prisma.allowedSubnet.upsert({
    where: { cidr },
    update: { label: label ?? "" },
    create: { cidr, label: label ?? "" },
  });
  res.status(201).json({ subnet });
});

// DELETE /api/machine/subnets/:id
machineRouter.delete("/subnets/:id", async (req, res) => {
  await prisma.allowedSubnet.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ deleted: true });
});

