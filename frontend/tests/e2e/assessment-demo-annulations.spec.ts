import { test, expect } from "@playwright/test";

/**
 * Assessment Demo Annulations — E2E Certification
 *
 * Tests the complete lifecycle: Partner → Analyst → Coordinator → Cerrada
 * Plus negative controls: readonly, invalid state, unauthorized email, scope.
 */

const JUSTIFICATION = "Solicitud generada por prueba E2E automatizada del Assessment Demo";
const TRANSITION_JUST = "Transición autorizada verificada por E2E automatizado";

async function loginAs(page: any, personaId: string) {
  const res = await page.request.post("/api/demo/session", {
    data: { personaId },
  });
  expect(res.status()).toBe(200);
  // Reload to pick up cookie
  await page.reload();
}

async function logout(page: any) {
  await page.request.delete("/api/demo/session");
}

test.describe("Assessment Demo Annulations — Full Lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    // Reset demo data before each test group
    await loginAs(page, "intern_coordinator");
    const resetRes = await page.request.post("/api/demo/reset");
    expect(resetRes.status()).toBe(200);
    await logout(page);
  });

  test("complete lifecycle: Partner → Analyst → Coordinator → Cerrada", async ({ page }) => {
    // 1. Open annulations page
    await page.goto("/anulaciones");
    await expect(page.getByText("Modo Demo Assessment")).toBeVisible();

    // 2-5. Login as Partner
    await loginAs(page, "partner_user");
    await page.goto("/anulaciones");
    await expect(page.getByText("Partner Demo Autorizado")).toBeVisible();

    // 6-7. Verify context endpoint resolves partner automatically
    const ctx = await page.request.get("/api/demo/context");
    const ctxData = await ctx.json();
    expect(ctxData.partner).not.toBeNull();
    expect(ctxData.partner.authorizedEmail).toContain("@example.com");

    // 8-14. Create annulation via API (like the UI wizard does)
    const pqrId = `PQR-E2E-${Date.now()}`;
    const createRes = await page.request.post("/api/annulations", {
      data: {
        partnerId: ctxData.partner.id,
        senderEmail: ctxData.partner.authorizedEmail,
        pqrId,
        justification: JUSTIFICATION,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    const annId = created.data.id;
    const radicado = created.data.radicado;
    expect(created.data.currentState).toBe("Solicitada");
    expect(radicado).toBeTruthy();

    // 15-19. Verify persistence after reload
    await page.reload();
    const listRes = await page.request.get("/api/annulations");
    const listData = await listRes.json();
    const found = listData.data.find((a: any) => a.id === annId);
    expect(found).toBeTruthy();
    expect(found.currentState).toBe("Solicitada");

    // 20-26. Switch to Analyst → Solicitada → En_Revision
    await loginAs(page, "intern_analyst");
    const t1 = await page.request.post(`/api/annulations/${annId}/transition`, {
      data: { targetState: "En_Revision", justification: TRANSITION_JUST, expectedVersion: found.version },
    });
    expect(t1.status()).toBe(200);
    const t1Data = await t1.json();
    expect(t1Data.data.currentState).toBe("En_Revision");

    // 27-34. Switch to Coordinator → full path to Cerrada
    await loginAs(page, "intern_coordinator");

    // Verify coordinator CANNOT do Solicitada → En_Revision on a Solicitada seed
    const seeds = await page.request.get("/api/annulations");
    const seedData = await seeds.json();
    const solicitadaSeed = seedData.data.find((a: any) => a.currentState === "Solicitada" && a.id !== annId);
    if (solicitadaSeed) {
      const forbidden = await page.request.post(`/api/annulations/${solicitadaSeed.id}/transition`, {
        data: { targetState: "En_Revision", justification: TRANSITION_JUST, expectedVersion: solicitadaSeed.version },
      });
      expect(forbidden.status()).toBe(403);
    }

    // En_Revision → Aprobada
    const t2 = await page.request.post(`/api/annulations/${annId}/transition`, {
      data: { targetState: "Aprobada", justification: TRANSITION_JUST, expectedVersion: t1Data.data.version },
    });
    expect(t2.status()).toBe(200);
    const t2Data = await t2.json();

    // Aprobada → En_Ejecucion
    const t3 = await page.request.post(`/api/annulations/${annId}/transition`, {
      data: { targetState: "En_Ejecucion", justification: TRANSITION_JUST, expectedVersion: t2Data.data.version },
    });
    expect(t3.status()).toBe(200);
    const t3Data = await t3.json();

    // En_Ejecucion → Cerrada
    const t4 = await page.request.post(`/api/annulations/${annId}/transition`, {
      data: { targetState: "Cerrada", justification: TRANSITION_JUST, expectedVersion: t3Data.data.version },
    });
    expect(t4.status()).toBe(200);

    // 35-38. Verify timeline
    const histRes = await page.request.get(`/api/annulations/${annId}/history`);
    expect(histRes.status()).toBe(200);
    const histData = await histRes.json();
    expect(histData.request.currentState).toBe("Cerrada");
    expect(histData.history).toHaveLength(4);
    expect(histData.history[0].toState).toBe("En_Revision");
    expect(histData.history[1].toState).toBe("Aprobada");
    expect(histData.history[2].toState).toBe("En_Ejecucion");
    expect(histData.history[3].toState).toBe("Cerrada");
  });

  test("rejection path: En_Revision → Rechazada", async ({ page }) => {
    await loginAs(page, "intern_coordinator");
    const list = await page.request.get("/api/annulations");
    const data = await list.json();
    const enRevision = data.data.find((a: any) => a.currentState === "En_Revision");
    expect(enRevision).toBeTruthy();

    const res = await page.request.post(`/api/annulations/${enRevision.id}/transition`, {
      data: { targetState: "Rechazada", justification: "Documentación insuficiente para aprobar la solicitud", expectedVersion: enRevision.version },
    });
    expect(res.status()).toBe(200);
    const resData = await res.json();
    expect(resData.data.currentState).toBe("Rechazada");

    // Terminal state — no further transitions
    const attempt = await page.request.post(`/api/annulations/${enRevision.id}/transition`, {
      data: { targetState: "Aprobada", justification: "Intento post-rechazo invalido", expectedVersion: resData.data.version },
    });
    expect(attempt.status()).toBe(409);
  });

  test("readonly cannot mutate", async ({ page }) => {
    await loginAs(page, "intern_readonly");
    await page.goto("/anulaciones");

    // Can list
    const list = await page.request.get("/api/annulations");
    expect(list.status()).toBe(200);

    // Cannot transition
    const data = await list.json();
    const any_ann = data.data[0];
    if (any_ann) {
      const res = await page.request.post(`/api/annulations/${any_ann.id}/transition`, {
        data: { targetState: "En_Revision", justification: "Readonly intento no autorizado", expectedVersion: any_ann.version },
      });
      expect(res.status()).toBe(403);
    }
  });

  test("coordinator scope: /api/admin denied, annulations allowed", async ({ page }) => {
    await loginAs(page, "intern_coordinator");
    const admin = await page.request.get("/api/admin");
    expect(admin.status()).toBe(403);
    const annulations = await page.request.get("/api/annulations");
    expect(annulations.status()).toBe(200);
  });

  test("invalid state transition: Solicitada → Cerrada = 409", async ({ page }) => {
    await loginAs(page, "intern_coordinator");
    const list = await page.request.get("/api/annulations");
    const data = await list.json();
    const solicitada = data.data.find((a: any) => a.currentState === "Solicitada");
    expect(solicitada).toBeTruthy();

    const res = await page.request.post(`/api/annulations/${solicitada.id}/transition`, {
      data: { targetState: "Cerrada", justification: "Intento de salto de estado invalido", expectedVersion: solicitada.version },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  test("concurrency: stale version = 409", async ({ page }) => {
    await loginAs(page, "intern_analyst");
    const list = await page.request.get("/api/annulations");
    const data = await list.json();
    const solicitada = data.data.find((a: any) => a.currentState === "Solicitada");
    expect(solicitada).toBeTruthy();

    // First transition succeeds
    const t1 = await page.request.post(`/api/annulations/${solicitada.id}/transition`, {
      data: { targetState: "En_Revision", justification: "Primera transición válida para test", expectedVersion: solicitada.version },
    });
    expect(t1.status()).toBe(200);

    // Same version again = conflict
    const t2 = await page.request.post(`/api/annulations/${solicitada.id}/transition`, {
      data: { targetState: "Aprobada", justification: "Intento con versión obsoleta reutilizada", expectedVersion: solicitada.version },
    });
    expect(t2.status()).toBe(409);
    const body = await t2.json();
    expect(body.error.code).toBe("CONCURRENT_MODIFICATION");
  });

  test("unauthorized email = 403", async ({ page }) => {
    await loginAs(page, "partner_user");
    const ctx = await page.request.get("/api/demo/context");
    const ctxData = await ctx.json();

    const res = await page.request.post("/api/annulations", {
      data: {
        partnerId: ctxData.partner.id,
        senderEmail: "not.authorized@example.com",
        pqrId: "PQR-UNAUTH",
        justification: "Intento con correo no autorizado para prueba E2E",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("reset demo: HTTP 200, exactly 6 seeds, history counts correct", async ({ page }) => {
    await loginAs(page, "intern_coordinator");
    const resetRes = await page.request.post("/api/demo/reset");
    expect(resetRes.status()).toBe(200);

    const list = await page.request.get("/api/annulations");
    const data = await list.json();
    const demoSeeds = data.data.filter((a: any) => a.radicado.startsWith("ANU-DEMO-"));
    expect(demoSeeds).toHaveLength(6);

    // Verify history counts
    const expectedHistory: Record<string, number> = {
      "ANU-DEMO-0001": 0, "ANU-DEMO-0002": 1, "ANU-DEMO-0003": 2,
      "ANU-DEMO-0004": 3, "ANU-DEMO-0005": 2, "ANU-DEMO-0006": 4,
    };
    for (const seed of demoSeeds) {
      const hist = await page.request.get(`/api/annulations/${seed.id}/history`);
      const histData = await hist.json();
      expect(histData.history.length).toBe(expectedHistory[seed.radicado]);
    }
  });
});
