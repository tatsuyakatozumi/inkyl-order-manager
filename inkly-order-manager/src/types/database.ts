export interface Database {
  public: {
    Tables: {
      ord_suppliers: {
        Row: {
          id: string;
          name: string;
          order_cycle: "monthly" | "irregular";
          auto_order_supported: boolean;
          login_url: string | null;
          credentials_encrypted: string | null;
          lead_time_days: number | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          order_cycle: "monthly" | "irregular";
          auto_order_supported?: boolean;
          login_url?: string | null;
          credentials_encrypted?: string | null;
          lead_time_days?: number | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          order_cycle?: "monthly" | "irregular";
          auto_order_supported?: boolean;
          login_url?: string | null;
          credentials_encrypted?: string | null;
          lead_time_days?: number | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      ord_items: {
        Row: {
          id: string;
          name: string;
          category_large: string;
          category_medium: string;
          category_small: string | null;
          supplier_id: string;
          alt_supplier_id: string | null;
          spec: string | null;
          unit_price: number | null;
          order_unit: string | null;
          order_unit_quantity: number | null;
          consumption_per_visit: number | null;
          is_visitor_linked: boolean;
          fixed_monthly_consumption: number | null;
          consumable_type: "consumable" | "non_consumable";
          auto_order_enabled: boolean;
          product_url: string | null;
          supplier_product_code: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category_large: string;
          category_medium: string;
          category_small?: string | null;
          supplier_id: string;
          alt_supplier_id?: string | null;
          spec?: string | null;
          unit_price?: number | null;
          order_unit?: string | null;
          order_unit_quantity?: number | null;
          consumption_per_visit?: number | null;
          is_visitor_linked?: boolean;
          fixed_monthly_consumption?: number | null;
          consumable_type?: "consumable" | "non_consumable";
          auto_order_enabled?: boolean;
          product_url?: string | null;
          supplier_product_code?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category_large?: string;
          category_medium?: string;
          category_small?: string | null;
          supplier_id?: string;
          alt_supplier_id?: string | null;
          spec?: string | null;
          unit_price?: number | null;
          order_unit?: string | null;
          order_unit_quantity?: number | null;
          consumption_per_visit?: number | null;
          is_visitor_linked?: boolean;
          fixed_monthly_consumption?: number | null;
          consumable_type?: "consumable" | "non_consumable";
          auto_order_enabled?: boolean;
          product_url?: string | null;
          supplier_product_code?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      ord_order_history: {
        Row: {
          id: string;
          item_id: string;
          supplier_id: string;
          order_date: string;
          order_type: "monthly_regular" | "ad_hoc";
          quantity: number;
          unit_price: number | null;
          total_amount: number | null;
          order_method: "auto" | "manual" | "slack_reported";
          auto_order_status:
            | "pending"
            | "cart_added"
            | "ordered"
            | "failed"
            | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          supplier_id: string;
          order_date: string;
          order_type: "monthly_regular" | "ad_hoc";
          quantity: number;
          unit_price?: number | null;
          total_amount?: number | null;
          order_method: "auto" | "manual" | "slack_reported";
          auto_order_status?:
            | "pending"
            | "cart_added"
            | "ordered"
            | "failed"
            | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          supplier_id?: string;
          order_date?: string;
          order_type?: "monthly_regular" | "ad_hoc";
          quantity?: number;
          unit_price?: number | null;
          total_amount?: number | null;
          order_method?: "auto" | "manual" | "slack_reported";
          auto_order_status?:
            | "pending"
            | "cart_added"
            | "ordered"
            | "failed"
            | null;
          notes?: string | null;
          created_at?: string;
        };
      };

      ord_inventory_snapshots: {
        Row: {
          id: string;
          item_id: string;
          snapshot_date: string;
          quantity: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          snapshot_date: string;
          quantity: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          snapshot_date?: string;
          quantity?: number;
          notes?: string | null;
          created_at?: string;
        };
      };

      ord_monthly_orders: {
        Row: {
          id: string;
          year_month: string;
          expected_visitors: number;
          item_id: string;
          calculated_quantity: number;
          inventory_quantity: number | null;
          adjustment: number | null;
          final_quantity: number;
          order_status: "draft" | "confirmed" | "ordered" | "completed";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          year_month: string;
          expected_visitors: number;
          item_id: string;
          calculated_quantity: number;
          inventory_quantity?: number | null;
          adjustment?: number | null;
          final_quantity: number;
          order_status?: "draft" | "confirmed" | "ordered" | "completed";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          year_month?: string;
          expected_visitors?: number;
          item_id?: string;
          calculated_quantity?: number;
          inventory_quantity?: number | null;
          adjustment?: number | null;
          final_quantity?: number;
          order_status?: "draft" | "confirmed" | "ordered" | "completed";
          created_at?: string;
          updated_at?: string;
        };
      };

      ord_stock_alerts: {
        Row: {
          id: string;
          item_id: string | null;
          alert_type: "low_stock" | "out_of_stock" | "ordered";
          raw_message: string;
          parsed_item_name: string | null;
          parsed_quantity: number | null;
          slack_user_id: string | null;
          slack_ts: string | null;
          reported_at: string;
        };
        Insert: {
          id?: string;
          item_id?: string | null;
          alert_type: "low_stock" | "out_of_stock" | "ordered";
          raw_message: string;
          parsed_item_name?: string | null;
          parsed_quantity?: number | null;
          slack_user_id?: string | null;
          slack_ts?: string | null;
          reported_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string | null;
          alert_type?: "low_stock" | "out_of_stock" | "ordered";
          raw_message?: string;
          parsed_item_name?: string | null;
          parsed_quantity?: number | null;
          slack_user_id?: string | null;
          slack_ts?: string | null;
          reported_at?: string;
        };
      };

      ord_visitor_stats: {
        Row: {
          id: string;
          year_month: string;
          actual_visitors: number;
          source: "manual" | "reservation_api";
          created_at: string;
        };
        Insert: {
          id?: string;
          year_month: string;
          actual_visitors: number;
          source: "manual" | "reservation_api";
          created_at?: string;
        };
        Update: {
          id?: string;
          year_month?: string;
          actual_visitors?: number;
          source?: "manual" | "reservation_api";
          created_at?: string;
        };
      };
    };
  };
}

// ---------------------------------------------------------------------------
// Convenient Row type aliases
// ---------------------------------------------------------------------------

export type Supplier = Database["public"]["Tables"]["ord_suppliers"]["Row"];
export type SupplierInsert =
  Database["public"]["Tables"]["ord_suppliers"]["Insert"];
export type SupplierUpdate =
  Database["public"]["Tables"]["ord_suppliers"]["Update"];

export type Item = Database["public"]["Tables"]["ord_items"]["Row"];
export type ItemInsert = Database["public"]["Tables"]["ord_items"]["Insert"];
export type ItemUpdate = Database["public"]["Tables"]["ord_items"]["Update"];

export type OrderHistory =
  Database["public"]["Tables"]["ord_order_history"]["Row"];
export type OrderHistoryInsert =
  Database["public"]["Tables"]["ord_order_history"]["Insert"];
export type OrderHistoryUpdate =
  Database["public"]["Tables"]["ord_order_history"]["Update"];

export type InventorySnapshot =
  Database["public"]["Tables"]["ord_inventory_snapshots"]["Row"];
export type InventorySnapshotInsert =
  Database["public"]["Tables"]["ord_inventory_snapshots"]["Insert"];
export type InventorySnapshotUpdate =
  Database["public"]["Tables"]["ord_inventory_snapshots"]["Update"];

export type MonthlyOrder =
  Database["public"]["Tables"]["ord_monthly_orders"]["Row"];
export type MonthlyOrderInsert =
  Database["public"]["Tables"]["ord_monthly_orders"]["Insert"];
export type MonthlyOrderUpdate =
  Database["public"]["Tables"]["ord_monthly_orders"]["Update"];

export type StockAlert =
  Database["public"]["Tables"]["ord_stock_alerts"]["Row"];
export type StockAlertInsert =
  Database["public"]["Tables"]["ord_stock_alerts"]["Insert"];
export type StockAlertUpdate =
  Database["public"]["Tables"]["ord_stock_alerts"]["Update"];

export type VisitorStats =
  Database["public"]["Tables"]["ord_visitor_stats"]["Row"];
export type VisitorStatsInsert =
  Database["public"]["Tables"]["ord_visitor_stats"]["Insert"];
export type VisitorStatsUpdate =
  Database["public"]["Tables"]["ord_visitor_stats"]["Update"];

// ---------------------------------------------------------------------------
// Enum-like types extracted from column definitions
// ---------------------------------------------------------------------------

export type OrderCycle = Supplier["order_cycle"];
export type ConsumableType = Item["consumable_type"];
export type OrderType = OrderHistory["order_type"];
export type OrderMethod = OrderHistory["order_method"];
export type AutoOrderStatus = NonNullable<OrderHistory["auto_order_status"]>;
export type OrderStatus = MonthlyOrder["order_status"];
export type AlertType = StockAlert["alert_type"];
export type VisitorStatsSource = VisitorStats["source"];

// ---------------------------------------------------------------------------
// Joined / relational types
// ---------------------------------------------------------------------------

/** Item with its primary supplier resolved. */
export type ItemWithSupplier = Item & {
  supplier: Supplier;
};

/** Item with both primary and alternate suppliers resolved. */
export type ItemWithSuppliers = Item & {
  supplier: Supplier;
  alt_supplier: Supplier | null;
};

/** Order history row with the related item and supplier resolved. */
export type OrderHistoryWithDetails = OrderHistory & {
  item: Item;
  supplier: Supplier;
};

/** Inventory snapshot with the related item resolved. */
export type InventorySnapshotWithItem = InventorySnapshot & {
  item: Item;
};

/** Monthly order row with the related item (and its supplier) resolved. */
export type MonthlyOrderWithItem = MonthlyOrder & {
  item: ItemWithSupplier;
};

/** Stock alert with the related item resolved (if linked). */
export type StockAlertWithItem = StockAlert & {
  item: Item | null;
};

// ---------------------------------------------------------------------------
// Utility helper – extract a table's types by name
// ---------------------------------------------------------------------------

export type TableName = keyof Database["public"]["Tables"];

export type TableRow<T extends TableName> =
  Database["public"]["Tables"][T]["Row"];
export type TableInsert<T extends TableName> =
  Database["public"]["Tables"][T]["Insert"];
export type TableUpdate<T extends TableName> =
  Database["public"]["Tables"][T]["Update"];
