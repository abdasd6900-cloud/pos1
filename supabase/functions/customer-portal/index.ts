interface Customer {
  id: string;
  name: string;
  phone: string;
  tier: string;
  debt: number;
  balance: number;
  appBalance: number;
  cashBalance: number;
  creditLimit: number;
  loyaltyPoints: number;
  notes: string;
  subscriptionNumber: string;
  subscriptionExpiry: number | null;
  createdAt: number;
  user_id: string;
}

interface Transaction {
  id: string;
  type: string;
  customerId: string | null;
  customerName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: string;
  createdAt: number;
}

interface TelecomSale {
  id: string;
  operationType: string;
  mode: string;
  companyName: string;
  bundleName: string;
  simName: string;
  simNumber: string;
  customerName: string;
  customerPhone: string;
  customerId: string | null;
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: string;
  createdAt: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const customerId = url.searchParams.get("id");
    if (!customerId) {
      return new Response(
        JSON.stringify({ error: "Customer ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const collections = ["customers", "transactions", "telecomSales", "settings"];
    const filterParam = `in.(${collections.join(",")})`;
    const fetchUrl = `${supabaseUrl}/rest/v1/data_sync?collection=${encodeURIComponent(filterParam)}&select=collection,data`;
    const resp = await fetch(fetchUrl, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error("data_sync fetch failed", resp.status, errBody);
      return new Response(
        JSON.stringify({ error: "Failed to fetch data" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows = await resp.json() as { collection: string; data: unknown }[];

    let customers: Customer[] = [];
    let transactions: Transaction[] = [];
    let telecomSales: TelecomSale[] = [];
    let currency = "ILS";

    for (const row of rows) {
      if (row.collection === "customers" && Array.isArray(row.data)) {
        customers = row.data as Customer[];
      } else if (row.collection === "transactions" && Array.isArray(row.data)) {
        transactions = row.data as Transaction[];
      } else if (row.collection === "telecomSales" && Array.isArray(row.data)) {
        telecomSales = row.data as TelecomSale[];
      } else if (row.collection === "settings" && typeof row.data === "object" && row.data !== null) {
        const s = row.data as Record<string, unknown>;
        if (typeof s.currency === "string") currency = s.currency;
      }
    }

    const customer = customers.find((c) => c.id === customerId);
    if (!customer) {
      return new Response(
        JSON.stringify({ error: "Customer not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customerTxns = transactions.filter(
      (t) => t.customerId === customerId,
    );
    const customerSales = telecomSales.filter(
      (s) => s.customerId === customerId || s.customerPhone === customer.phone,
    );

    return new Response(
      JSON.stringify({
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          tier: customer.tier,
          debt: customer.debt,
          balance: customer.balance,
          appBalance: customer.appBalance ?? 0,
          cashBalance: customer.cashBalance ?? 0,
          creditLimit: customer.creditLimit,
          loyaltyPoints: customer.loyaltyPoints,
          notes: customer.notes,
          subscriptionNumber: customer.subscriptionNumber,
          subscriptionExpiry: customer.subscriptionExpiry,
          createdAt: customer.createdAt,
        },
        transactions: customerTxns.map((t) => ({
          id: t.id,
          type: t.type,
          date: t.createdAt,
          total: t.total,
          paid: t.paid,
          remaining: t.remaining,
          paymentMethod: t.paymentMethod,
          items: t.items,
        })),
        telecomSales: customerSales.map((s) => ({
          id: s.id,
          operationType: s.operationType,
          mode: s.mode,
          companyName: s.companyName,
          bundleName: s.bundleName,
          simName: s.simName,
          simNumber: s.simNumber,
          date: s.createdAt,
          total: s.total,
          paid: s.paid,
          remaining: s.remaining,
          paymentMethod: s.paymentMethod,
        })),
        currency,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("customer-portal error", err);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
