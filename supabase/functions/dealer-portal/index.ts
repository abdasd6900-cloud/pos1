/*
 * Dealer Portal Edge Function — بوابة الموزع الذكية
 *
 * Handles dealer authentication and all dealer-facing API operations:
 * - POST /auth — dealer login (phone + password)
 * - GET /dashboard — summary stats, recent requests, wallet balance
 * - GET /customers — list dealer's customers/numbers
 * - POST /customers — add a customer
 * - PUT /customers/:id — update a customer
 * - DELETE /customers/:id — remove a customer
 * - GET /requests — list recharge requests
 * - POST /requests — create a recharge request
 * - GET /offers — list available offers with dealer pricing
 * - GET /sims — list plastic SIM cards
 * - POST /sims — add a plastic SIM (owner only)
 * - PUT /sims/:id — update/transfer a SIM
 * - GET /notifications — list notifications
 * - PUT /notifications/:id — mark as read
 * - GET /transactions — wallet ledger
 * - GET /pricing — dealer pricing (for owner)
 * - POST /pricing — set/update pricing (owner only)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Dealer-Token",
};

interface DealerRow {
  id: string;
  owner_user_id: string;
  name: string;
  phone: string;
  password_hash: string;
  balance: number;
  credit_limit: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "sahab-dealer-salt-v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}

async function verifyDealerToken(token: string, supabaseUrl: string, serviceKey: string): Promise<DealerRow | null> {
  try {
    const parts = token.split(":");
    if (parts.length !== 2) return null;
    const dealerId = parts[0];
    const tokenHash = parts[1];

    const resp = await fetch(`${supabaseUrl}/rest/v1/dealers?id=eq.${dealerId}&select=*`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!resp.ok) return null;
    const rows = await resp.json() as DealerRow[];
    if (rows.length === 0) return null;
    const dealer = rows[0];
    // tokenHash is the hash of dealer.id + dealer.password_hash
    const encoder = new TextEncoder();
    const data = encoder.encode(dealer.id + dealer.password_hash + "sahab-dealer-salt-v1");
    const hash = await crypto.subtle.digest("SHA-256", data);
    const expectedToken = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (tokenHash !== expectedToken) return null;
    if (!dealer.active) return null;
    return dealer;
  } catch {
    return null;
  }
}

async function generateDealerToken(dealer: DealerRow): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(dealer.id + dealer.password_hash + "sahab-dealer-salt-v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  const tokenHash = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${dealer.id}:${tokenHash}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server configuration error" }, 500);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/functions\/v1\/dealer-portal/, "") || "/";
    const method = req.method;

    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

    // ============ AUTH ============
    if (path === "/auth" && method === "POST") {
      const body = await req.json();
      const { phone, password } = body;
      if (!phone || !password) return json({ error: "رقم الهاتف وكلمة المرور مطلوبة" }, 400);

      const cleanPhone = phone.replace(/\D/g, "");
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealers?phone=eq.${cleanPhone}&active=eq.true&select=*`, {
        headers,
      });
      if (!resp.ok) return json({ error: "تعذر الاتصال بالخادم" }, 502);
      const dealers = await resp.json() as DealerRow[];
      if (dealers.length === 0) return json({ error: "رقم الهاتف غير مسجل أو غير مفعل" }, 404);

      const dealer = dealers[0];
      const valid = await verifyPassword(password, dealer.password_hash);
      if (!valid) return json({ error: "كلمة المرور غير صحيحة" }, 401);

      const token = await generateDealerToken(dealer);
      return json({
        token,
        dealer: {
          id: dealer.id,
          name: dealer.name,
          phone: dealer.phone,
          balance: Number(dealer.balance),
          credit_limit: Number(dealer.credit_limit),
        },
      });
    }

    // ============ AUTHENTICATED ROUTES ============
    const authHeader = req.headers.get("X-Dealer-Token") || "";
    if (!authHeader) return json({ error: "غير مصرح" }, 401);

    const dealer = await verifyDealerToken(authHeader, supabaseUrl, serviceKey);
    if (!dealer) return json({ error: "جلسة غير صالحة" }, 401);

    const dealerFilter = `dealer_id=eq.${dealer.id}`;

    // ============ DASHBOARD ============
    if (path === "/dashboard" && method === "GET") {
      const [reqResp, custResp, txnResp, notifResp, simResp] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/dealer_recharge_requests?${dealerFilter}&order=created_at.desc&limit=5`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/dealer_customers?${dealerFilter}&order=created_at.desc`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/dealer_transactions?${dealerFilter}&order=created_at.desc&limit=10`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/dealer_notifications?${dealerFilter}&read=eq.false&order=created_at.desc&limit=5`, { headers }),
        fetch(`${supabaseUrl}/rest/v1/dealer_plastic_sims?${dealerFilter}&status=eq.in_stock`, { headers }),
      ]);

      const requests = await reqResp.json();
      const customers = await custResp.json();
      const transactions = await txnResp.json();
      const notifications = await notifResp.json();
      const sims = await simResp.json();

      const pendingCount = Array.isArray(requests) ? requests.filter((r: any) => r.status === "pending").length : 0;
      const activeCount = Array.isArray(customers) ? customers.filter((c: any) => c.status === 'active').length : 0;
      const simCount = Array.isArray(sims) ? sims.length : 0;
      const unreadCount = Array.isArray(notifications) ? notifications.length : 0;

      return json({
        balance: Number(dealer.balance),
        credit_limit: Number(dealer.credit_limit),
        pending_requests: pendingCount,
        active_customers: activeCount,
        plastic_sims: simCount,
        unread_notifications: unreadCount,
        recent_requests: requests,
        recent_transactions: transactions,
      });
    }

    // ============ CUSTOMERS ============
    if (path === "/customers" && method === "GET") {
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_customers?${dealerFilter}&order=created_at.desc`, { headers });
      const data = await resp.json();
      return json(data);
    }

    if (path === "/customers" && method === "POST") {
      const body = await req.json();
      if (!body.customer_name) return json({ error: "اسم الزبون مطلوب" }, 400);
      const insertBody = {
        dealer_id: dealer.id,
        phone_number: body.phone_number || null,
        customer_name: body.customer_name,
        contact_phone: body.contact_phone || null,
        company_name: body.company_name || null,
        status: body.status || "active",
      };
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_customers`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(insertBody),
      });
      const data = await resp.json();
      if (!resp.ok) return json({ error: "فشل إضافة الزبون" }, 500);
      return json(data[0]);
    }

    if (path.startsWith("/customers/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_customers?id=eq.${id}&${dealerFilter}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          phone_number: body.phone_number,
          customer_name: body.customer_name,
          contact_phone: body.contact_phone,
          company_name: body.company_name,
          status: body.status,
          updated_at: new Date().toISOString(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) return json({ error: "فشل تحديث الزبون" }, 500);
      return json(data[0]);
    }

    if (path.startsWith("/customers/") && method === "DELETE") {
      const id = path.split("/")[2];
      await fetch(`${supabaseUrl}/rest/v1/dealer_customers?id=eq.${id}&${dealerFilter}`, {
        method: "DELETE",
        headers,
      });
      return json({ success: true });
    }

    // ============ RECHARGE REQUESTS ============
    if (path === "/requests" && method === "GET") {
      const statusFilter = url.searchParams.get("status");
      let query = `dealer_id=eq.${dealer.id}`;
      if (statusFilter) query += `&status=eq.${statusFilter}`;
      query += `&order=created_at.desc`;
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_recharge_requests?${query}`, { headers });
      const data = await resp.json();
      return json(data);
    }

    if (path === "/requests" && method === "POST") {
      const body = await req.json();
      if (!body.customer_name) return json({ error: "اسم الزبون مطلوب" }, 400);

      const insertBody = {
        dealer_id: dealer.id,
        customer_name: body.customer_name,
        contact_phone: body.contact_phone || null,
        sim_number: body.sim_number || null,
        company_name: body.company_name || null,
        bundle_name: body.bundle_name || null,
        duration: body.duration || null,
        sale_price: body.sale_price || 0,
        status: "pending",
        sms_message: body.sms_message || null,
      };

      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_recharge_requests`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(insertBody),
      });
      const data = await resp.json();
      if (!resp.ok) return json({ error: "فشل إنشاء الطلب" }, 500);

      // Create notification for the owner
      const ownerNotifBody = {
        dealer_id: dealer.id,
        type: "new_request",
        title: `طلب شحن جديد من ${dealer.name}`,
        body: `${body.customer_name} - ${body.company_name || ""} ${body.bundle_name || ""}`,
        related_request_id: data[0]?.id,
      };
      // We'll also insert into sync_events so the main app picks it up
      const syncBody = {
        event_id: `dealer_req_${data[0]?.id}_${Date.now()}`,
        event_type: "dealer_recharge_request",
        payload: {
          ...insertBody,
          id: data[0]?.id,
          dealer_id: dealer.id,
          dealer_name: dealer.name,
          dealer_phone: dealer.phone,
          created_at: data[0]?.created_at,
        },
        source: "web",
        user_id: dealer.owner_user_id,
      };
      await fetch(`${supabaseUrl}/rest/v1/sync_events`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(syncBody),
      }).catch(() => {});

      return json(data[0]);
    }

    // ============ OFFERS / PRICING ============
    if (path === "/offers" && method === "GET") {
      const ownerFilter = `owner_user_id=eq.${dealer.owner_user_id}&active=eq.true&order=company_name,bundle_name`;
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_pricing?${ownerFilter}`, { headers });
      const data = await resp.json();
      return json(data);
    }

    // ============ PRICING (owner only — but we allow dealers to view) ============
    if (path === "/pricing" && method === "GET") {
      const ownerFilter = `owner_user_id=eq.${dealer.owner_user_id}&order=company_name,bundle_name`;
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_pricing?${ownerFilter}`, { headers });
      const data = await resp.json();
      return json(data);
    }

    // ============ PLASTIC SIMS ============
    if (path === "/sims" && method === "GET") {
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_plastic_sims?${dealerFilter}&order=created_at.desc`, { headers });
      const data = await resp.json();
      return json(data);
    }

    if (path === "/sims" && method === "POST") {
      const body = await req.json();
      if (!body.sim_number || !body.company_name) return json({ error: "رقم الشريحة واسم الشركة مطلوبة" }, 400);
      const insertBody = {
        dealer_id: dealer.id,
        sim_number: body.sim_number,
        company_name: body.company_name,
        bundle_name: body.bundle_name || null,
        status: body.status || "in_stock",
      };
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_plastic_sims`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(insertBody),
      });
      const data = await resp.json();
      if (!resp.ok) return json({ error: "فشل إضافة الشريحة" }, 500);
      return json(data[0]);
    }

    if (path.startsWith("/sims/") && method === "PUT") {
      const id = path.split("/")[2];
      const body = await req.json();
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_plastic_sims?id=eq.${id}&${dealerFilter}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          status: body.status,
          assigned_phone: body.assigned_phone,
          bundle_name: body.bundle_name,
          updated_at: new Date().toISOString(),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) return json({ error: "فشل تحديث الشريحة" }, 500);
      return json(data[0]);
    }

    if (path.startsWith("/sims/") && method === "DELETE") {
      const id = path.split("/")[2];
      await fetch(`${supabaseUrl}/rest/v1/dealer_plastic_sims?id=eq.${id}&${dealerFilter}`, {
        method: "DELETE",
        headers,
      });
      return json({ success: true });
    }

    // ============ NOTIFICATIONS ============
    if (path === "/notifications" && method === "GET") {
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_notifications?${dealerFilter}&order=created_at.desc&limit=50`, { headers });
      const data = await resp.json();
      return json(data);
    }

    if (path.startsWith("/notifications/") && method === "PUT") {
      const id = path.split("/")[2];
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_notifications?id=eq.${id}&${dealerFilter}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (!resp.ok) return json({ error: "فشل تحديث الإشعار" }, 500);
      return json({ success: true });
    }

    // ============ TRANSACTIONS ============
    if (path === "/transactions" && method === "GET") {
      const resp = await fetch(`${supabaseUrl}/rest/v1/dealer_transactions?${dealerFilter}&order=created_at.desc&limit=100`, { headers });
      const data = await resp.json();
      return json(data);
    }

    return json({ error: "المسار غير موجود" }, 404);
  } catch (err) {
    return json({ error: "خطأ في الخادم" }, 500);
  }
});
