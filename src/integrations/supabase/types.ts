export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          restaurant_id: string
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          restaurant_id?: string
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          restaurant_id?: string
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          restaurant_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          restaurant_id?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          restaurant_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customer_payments: {
        Row: {
          restaurant_id: string
          amount: number
          collected_by: string | null
          created_at: string
          customer_id: string
          id: string
          method: string
          note: string | null
          reference: string | null
        }
        Insert: {
          restaurant_id?: string
          amount: number
          collected_by?: string | null
          created_at?: string
          customer_id: string
          id?: string
          method?: string
          note?: string | null
          reference?: string | null
        }
        Update: {
          restaurant_id?: string
          amount?: number
          collected_by?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          method?: string
          note?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          restaurant_id: string
          address: string | null
          created_at: string
          credit_limit: number
          customer_type: string
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          outstanding: number
          phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          restaurant_id?: string
          address?: string | null
          created_at?: string
          credit_limit?: number
          customer_type?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          outstanding?: number
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          restaurant_id?: string
          address?: string | null
          created_at?: string
          credit_limit?: number
          customer_type?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          outstanding?: number
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      day_books: {
        Row: {
          restaurant_id: string
          bill_sales: number
          business_date: string
          closed_at: string | null
          closed_by: string | null
          closing_balance: number
          created_at: string
          expenses_total: number
          extra_card_sales: number
          extra_cash_sales: number
          extra_note: string | null
          extra_upi_sales: number
          id: string
          is_closed: boolean
          opening_balance: number
          opening_locked: boolean
          updated_at: string
        }
        Insert: {
          restaurant_id?: string
          bill_sales?: number
          business_date: string
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number
          created_at?: string
          expenses_total?: number
          extra_card_sales?: number
          extra_cash_sales?: number
          extra_note?: string | null
          extra_upi_sales?: number
          id?: string
          is_closed?: boolean
          opening_balance?: number
          opening_locked?: boolean
          updated_at?: string
        }
        Update: {
          restaurant_id?: string
          bill_sales?: number
          business_date?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number
          created_at?: string
          expenses_total?: number
          extra_card_sales?: number
          extra_cash_sales?: number
          extra_note?: string | null
          extra_upi_sales?: number
          id?: string
          is_closed?: boolean
          opening_balance?: number
          opening_locked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          restaurant_id: string
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          payment_method: string
          status: string
          title: string
        }
        Insert: {
          restaurant_id?: string
          amount: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string
          status?: string
          title: string
        }
        Update: {
          restaurant_id?: string
          amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      invoice_counters: {
        Row: {
          restaurant_id: string
          last_number: number
          year: number
        }
        Insert: {
          restaurant_id?: string
          last_number?: number
          year: number
        }
        Update: {
          restaurant_id?: string
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          restaurant_id: string
          cgst: number
          discount: number
          gst_rate: number
          hsn_code: string | null
          id: string
          igst: number
          invoice_id: string
          line_total: number
          product_id: string | null
          product_name: string
          purchase_price: number
          quantity: number
          returned_qty: number
          sgst: number
          sku: string | null
          taxable_amount: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          restaurant_id?: string
          cgst?: number
          discount?: number
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          igst?: number
          invoice_id: string
          line_total?: number
          product_id?: string | null
          product_name: string
          purchase_price?: number
          quantity: number
          returned_qty?: number
          sgst?: number
          sku?: string | null
          taxable_amount?: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          restaurant_id?: string
          cgst?: number
          discount?: number
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          igst?: number
          invoice_id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          purchase_price?: number
          quantity?: number
          returned_qty?: number
          sgst?: number
          sku?: string | null
          taxable_amount?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          restaurant_id: string
          bill_discount: number
          cancel_reason: string | null
          cashier_id: string | null
          cashier_name: string | null
          cgst: number
          cost_total: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          grand_total: number
          id: string
          igst: number
          invoice_date: string
          invoice_number: string
          item_discount: number
          notes: string | null
          payment_method: string
          round_off: number
          sgst: number
          status: string
          subtotal: number
          taxable_amount: number
        }
        Insert: {
          restaurant_id?: string
          bill_discount?: number
          cancel_reason?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          cgst?: number
          cost_total?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          grand_total?: number
          id?: string
          igst?: number
          invoice_date?: string
          invoice_number: string
          item_discount?: number
          notes?: string | null
          payment_method?: string
          round_off?: number
          sgst?: number
          status?: string
          subtotal?: number
          taxable_amount?: number
        }
        Update: {
          restaurant_id?: string
          bill_discount?: number
          cancel_reason?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          cgst?: number
          cost_total?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          grand_total?: number
          id?: string
          igst?: number
          invoice_date?: string
          invoice_number?: string
          item_discount?: number
          notes?: string | null
          payment_method?: string
          round_off?: number
          sgst?: number
          status?: string
          subtotal?: number
          taxable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          restaurant_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          restaurant_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          restaurant_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      kitchen_items: {
        Row: {
          restaurant_id: string
          cost_price: number
          created_at: string
          current_stock: number
          id: string
          is_active: boolean
          min_stock: number
          name: string
          unit: string
          updated_at: string
        }
        Insert: {
          restaurant_id?: string
          cost_price?: number
          created_at?: string
          current_stock?: number
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          unit?: string
          updated_at?: string
        }
        Update: {
          restaurant_id?: string
          cost_price?: number
          created_at?: string
          current_stock?: number
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      kitchen_stock_movements: {
        Row: {
          restaurant_id: string
          balance_after: number | null
          created_at: string
          id: string
          item_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          restaurant_id?: string
          balance_after?: number | null
          created_at?: string
          id?: string
          item_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          restaurant_id?: string
          balance_after?: number | null
          created_at?: string
          id?: string
          item_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "kitchen_items"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          restaurant_id: string
          amount: number
          created_at: string
          id: string
          invoice_id: string | null
          method: string
          reference: string | null
        }
        Insert: {
          restaurant_id?: string
          amount: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          method: string
          reference?: string | null
        }
        Update: {
          restaurant_id?: string
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          method?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          restaurant_id: string
          barcode: string | null
          brand: string | null
          category_id: string | null
          created_at: string
          current_stock: number
          description: string | null
          gst_rate: number
          hsn_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          min_stock: number
          mrp: number
          name: string
          parent_id: string | null
          purchase_price: number
          selling_price: number
          sku: string
          supplier_id: string | null
          unit: string
          updated_at: string
          variant_name: string | null
        }
        Insert: {
          restaurant_id?: string
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          created_at?: string
          current_stock?: number
          description?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number
          mrp?: number
          name: string
          parent_id?: string | null
          purchase_price?: number
          selling_price?: number
          sku: string
          supplier_id?: string | null
          unit?: string
          updated_at?: string
          variant_name?: string | null
        }
        Update: {
          restaurant_id?: string
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          created_at?: string
          current_stock?: number
          description?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number
          mrp?: number
          name?: string
          parent_id?: string | null
          purchase_price?: number
          selling_price?: number
          sku?: string
          supplier_id?: string | null
          unit?: string
          updated_at?: string
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          restaurant_id: string
          gst_rate: number
          id: string
          kitchen_item_id: string | null
          line_total: number
          product_id: string | null
          product_name: string
          purchase_id: string
          purchase_price: number
          quantity: number
        }
        Insert: {
          restaurant_id?: string
          gst_rate?: number
          id?: string
          kitchen_item_id?: string | null
          line_total?: number
          product_id?: string | null
          product_name: string
          purchase_id: string
          purchase_price: number
          quantity: number
        }
        Update: {
          restaurant_id?: string
          gst_rate?: number
          id?: string
          kitchen_item_id?: string | null
          line_total?: number
          product_id?: string | null
          product_name?: string
          purchase_id?: string
          purchase_price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_kitchen_item_id_fkey"
            columns: ["kitchen_item_id"]
            isOneToOne: false
            referencedRelation: "kitchen_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          restaurant_id: string
          created_at: string
          created_by: string | null
          grand_total: number
          id: string
          invoice_number: string | null
          purchase_date: string
          status: string
          subtotal: number
          supplier_id: string | null
          supplier_name: string | null
          tax_total: number
        }
        Insert: {
          restaurant_id?: string
          created_at?: string
          created_by?: string | null
          grand_total?: number
          id?: string
          invoice_number?: string | null
          purchase_date?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          supplier_name?: string | null
          tax_total?: number
        }
        Update: {
          restaurant_id?: string
          created_at?: string
          created_by?: string | null
          grand_total?: number
          id?: string
          invoice_number?: string | null
          purchase_date?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          supplier_name?: string | null
          tax_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_members: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          restaurant_id: string
          amount: number
          id: string
          invoice_item_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          return_id: string
        }
        Insert: {
          restaurant_id?: string
          amount?: number
          id?: string
          invoice_item_id?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          return_id: string
        }
        Update: {
          restaurant_id?: string
          amount?: number
          id?: string
          invoice_item_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          restaurant_id: string
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          reason: string | null
          refund_method: string
          return_number: string
          total_amount: number
        }
        Insert: {
          restaurant_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          reason?: string | null
          refund_method?: string
          return_number: string
          total_amount?: number
        }
        Update: {
          restaurant_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          reason?: string | null
          refund_method?: string
          return_number?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          restaurant_id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          restaurant_id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          restaurant_id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      staff_attendance: {
        Row: {
          restaurant_id: string
          attendance_date: string
          created_at: string
          id: string
          marked_by: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          restaurant_id?: string
          attendance_date: string
          created_at?: string
          id?: string
          marked_by?: string | null
          staff_id: string
          status: string
          updated_at?: string
        }
        Update: {
          restaurant_id?: string
          attendance_date?: string
          created_at?: string
          id?: string
          marked_by?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          restaurant_id: string
          created_at: string
          daily_wage: number
          designation: string | null
          id: string
          is_active: boolean
          joined_on: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          restaurant_id?: string
          created_at?: string
          daily_wage?: number
          designation?: string | null
          id?: string
          is_active?: boolean
          joined_on?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          restaurant_id?: string
          created_at?: string
          daily_wage?: number
          designation?: string | null
          id?: string
          is_active?: boolean
          joined_on?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          balance_after: number | null
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          balance_after?: number | null
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          balance_after?: number | null
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          restaurant_id: string
          address: string | null
          company: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          restaurant_id?: string
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          restaurant_id?: string
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_stock: {
        Args: {
          _delta: number
          _product_id: string
          _reason: string
          _ref_id: string
          _ref_type: string
          _type: string
        }
        Returns: number
      }
      add_restaurant_member: {
        Args: { _email: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: undefined
      }
      create_restaurant: {
        Args: { _address?: string; _name: string; _phone?: string }
        Returns: string
      }
      remove_restaurant_member: { Args: { _user_id: string }; Returns: undefined }
      edit_sale: { Args: { _invoice_id: string; payload: Json }; Returns: Json }
      cancel_expense: {
        Args: { _expense_id: string; _reason: string }
        Returns: undefined
      }
      cancel_invoice: {
        Args: { _invoice_id: string; _reason: string }
        Returns: undefined
      }
      collect_customer_payment: {
        Args: {
          _amount: number
          _customer_id: string
          _method: string
          _note: string
          _reference: string
        }
        Returns: undefined
      }
      create_purchase: { Args: { payload: Json }; Returns: Json }
      create_sale: { Args: { payload: Json }; Returns: Json }
      create_sales_return: { Args: { payload: Json }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      kitchen_add_item: {
        Args: {
          _cost?: number
          _min?: number
          _name: string
          _opening?: number
          _unit: string
        }
        Returns: string
      }
      kitchen_remove_item: { Args: { _item_id: string }; Returns: undefined }
      kitchen_stock_adjust: {
        Args: { _delta: number; _item_id: string; _reason: string; _type: string }
        Returns: number
      }
      list_staff: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      manual_stock_adjust: {
        Args: {
          _new_qty: number
          _product_id: string
          _reason: string
          _type: string
        }
        Returns: number
      }
      next_invoice_number: { Args: never; Returns: string }
      recalc_day_books_from: { Args: { _date: string }; Returns: undefined }
      save_day_book: {
        Args: {
          _close?: boolean
          _date: string
          _extra_card?: number
          _extra_cash?: number
          _extra_upi?: number
          _note?: string
          _opening?: number
        }
        Returns: Json
      }
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "cashier"],
    },
  },
} as const
