
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attendance_records": {
                  Row: {
                    "check_in": string,"check_out": string | null,"company_id": string,"created_at": string,"created_by": string,"employee_id": string,"id": string,"reason": string | null,"source": string,"status": string,"updated_at": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "check_in": string,"check_out"?: string | null,"company_id": string,"created_at"?: string,"created_by": string,"employee_id": string,"id"?: string,"reason"?: string | null,"source"?: string,"status"?: string,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "check_in"?: string,"check_out"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string,"employee_id"?: string,"id"?: string,"reason"?: string | null,"source"?: string,"status"?: string,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_records_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_attendance_employee"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_role": string | null,"company_id": string | null,"created_at": string,"id": string,"new_data": Json | null,"old_data": Json | null,"performed_by": string | null,"record_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_role"?: string | null,"company_id"?: string | null,"created_at"?: string,"id"?: string,"new_data"?: Json | null,"old_data"?: Json | null,"performed_by"?: string | null,"record_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_role"?: string | null,"company_id"?: string | null,"created_at"?: string,"id"?: string,"new_data"?: Json | null,"old_data"?: Json | null,"performed_by"?: string | null,"record_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_performed_by_fkey"
      columns: ["performed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_performed_by_fkey"
      columns: ["performed_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_movements": {
                  Row: {
                    "amount": number,"company_id": string,"created_at": string,"created_by": string,"id": string,"movement_type": string,"reason": string,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"company_id": string,"created_at"?: string,"created_by": string,"id"?: string,"movement_type": string,"reason": string,"session_id": string
                  }
                  Update: {
                    "amount"?: number,"company_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"movement_type"?: string,"reason"?: string,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_movements_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cash_movements_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "cash_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_sessions": {
                  Row: {
                    "cash_in_amount": number | null,"cash_out_amount": number | null,"cash_refunds_amount": number | null,"cash_sales_amount": number | null,"closed_at": string | null,"closed_by": string | null,"closing_notes": string | null,"company_id": string,"counted_amount": number | null,"difference_amount": number | null,"expected_amount": number | null,"id": string,"opened_at": string,"opened_by": string,"opening_amount": number,"opening_notes": string | null,"other_payments": Json | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cash_in_amount"?: number | null,"cash_out_amount"?: number | null,"cash_refunds_amount"?: number | null,"cash_sales_amount"?: number | null,"closed_at"?: string | null,"closed_by"?: string | null,"closing_notes"?: string | null,"company_id": string,"counted_amount"?: number | null,"difference_amount"?: number | null,"expected_amount"?: number | null,"id"?: string,"opened_at"?: string,"opened_by": string,"opening_amount": number,"opening_notes"?: string | null,"other_payments"?: Json | null,"status"?: string
                  }
                  Update: {
                    "cash_in_amount"?: number | null,"cash_out_amount"?: number | null,"cash_refunds_amount"?: number | null,"cash_sales_amount"?: number | null,"closed_at"?: string | null,"closed_by"?: string | null,"closing_notes"?: string | null,"company_id"?: string,"counted_amount"?: number | null,"difference_amount"?: number | null,"expected_amount"?: number | null,"id"?: string,"opened_at"?: string,"opened_by"?: string,"opening_amount"?: number,"opening_notes"?: string | null,"other_payments"?: Json | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_sessions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "company_id": string,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "allow_negative_stock": boolean,"created_at": string,"created_by": string,"currency": string,"id": string,"is_active": boolean,"name": string,"owner_id": string,"tax_id": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_negative_stock"?: boolean,"created_at"?: string,"created_by": string,"currency"?: string,"id"?: string,"is_active"?: boolean,"name": string,"owner_id": string,"tax_id"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "allow_negative_stock"?: boolean,"created_at"?: string,"created_by"?: string,"currency"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"owner_id"?: string,"tax_id"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "companies_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "companies_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "companies_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"company_counters": {
                  Row: {
                    "company_id": string,"kind": string,"last_value": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"kind": string,"last_value"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"kind"?: string,"last_value"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_counters_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"company_invitations": {
                  Row: {
                    "accepted_at": string | null,"company_id": string,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string,"role": string,"status": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"company_id": string,"created_at"?: string,"email": string,"expires_at": string,"id"?: string,"invited_by": string,"role": string,"status"?: string,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"company_id"?: string,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string,"role"?: string,"status"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_invitations_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"company_members": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"is_active": boolean,"joined_at": string,"role": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"joined_at"?: string,"role": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"joined_at"?: string,"role"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_members_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "company_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"credit_purchases": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string,"purchase_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by": string,"purchase_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string,"purchase_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "credit_purchases_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_credit_purchases_purchase"
      columns: ["company_id","purchase_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"customer_payments": {
                  Row: {
                    "amount": number,"cash_movement_id": string | null,"company_id": string,"created_at": string,"created_by": string,"customer_id": string,"id": string,"idempotency_key": string,"notes": string | null,"payments": NonNullable<Json>,"status": string,"void_cash_movement_id": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"cash_movement_id"?: string | null,"company_id": string,"created_at"?: string,"created_by": string,"customer_id": string,"id"?: string,"idempotency_key": string,"notes"?: string | null,"payments": NonNullable<Json>,"status"?: string,"void_cash_movement_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"cash_movement_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string,"id"?: string,"idempotency_key"?: string,"notes"?: string | null,"payments"?: NonNullable<Json>,"status"?: string,"void_cash_movement_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_payments_cash_movement_id_fkey"
      columns: ["cash_movement_id"]
isOneToOne: false
      referencedRelation: "cash_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_payments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_payments_void_cash_movement_id_fkey"
      columns: ["void_cash_movement_id"]
isOneToOne: false
      referencedRelation: "cash_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_customer_payments_customer"
      columns: ["company_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "address": string | null,"company_id": string,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"identification_type": string,"is_active": boolean,"name": string,"notes": string | null,"phone": string | null,"tax_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"identification_type"?: string,"is_active"?: boolean,"name": string,"notes"?: string | null,"phone"?: string | null,"tax_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"identification_type"?: string,"is_active"?: boolean,"name"?: string,"notes"?: string | null,"phone"?: string | null,"tax_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_schedules": {
                  Row: {
                    "company_id": string,"employee_id": string,"end_time": string,"id": string,"start_time": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"employee_id": string,"end_time": string,"id"?: string,"start_time": string,"weekday": number
                  }
                  Update: {
                    "company_id"?: string,"employee_id"?: string,"end_time"?: string,"id"?: string,"start_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_schedules_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_schedules_employee"
      columns: ["company_id","employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string,"document_number": string | null,"full_name": string,"hire_date": string | null,"id": string,"job_title": string | null,"notes": string | null,"phone": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by": string,"document_number"?: string | null,"full_name": string,"hire_date"?: string | null,"id"?: string,"job_title"?: string | null,"notes"?: string | null,"phone"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string,"document_number"?: string | null,"full_name"?: string,"hire_date"?: string | null,"id"?: string,"job_title"?: string | null,"notes"?: string | null,"phone"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"cash_movement_id": string | null,"category": string,"company_id": string,"created_at": string,"created_by": string,"description": string,"expense_date": string,"id": string,"machine_id": string | null,"payment_method": string,"status": string,"supplier_id": string | null,"void_cash_movement_id": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"cash_movement_id"?: string | null,"category": string,"company_id": string,"created_at"?: string,"created_by": string,"description": string,"expense_date": string,"id"?: string,"machine_id"?: string | null,"payment_method": string,"status"?: string,"supplier_id"?: string | null,"void_cash_movement_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"cash_movement_id"?: string | null,"category"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string,"description"?: string,"expense_date"?: string,"id"?: string,"machine_id"?: string | null,"payment_method"?: string,"status"?: string,"supplier_id"?: string | null,"void_cash_movement_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_cash_movement_id_fkey"
      columns: ["cash_movement_id"]
isOneToOne: false
      referencedRelation: "cash_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_void_cash_movement_id_fkey"
      columns: ["void_cash_movement_id"]
isOneToOne: false
      referencedRelation: "cash_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_expenses_machine"
      columns: ["company_id","machine_id"]
isOneToOne: false
      referencedRelation: "machines"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"machines": {
                  Row: {
                    "brand": string | null,"company_id": string,"created_at": string,"created_by": string,"id": string,"identifier": string | null,"machine_type": string,"model": string | null,"model_year": number | null,"name": string,"notes": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand"?: string | null,"company_id": string,"created_at"?: string,"created_by": string,"id"?: string,"identifier"?: string | null,"machine_type": string,"model"?: string | null,"model_year"?: number | null,"name": string,"notes"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "brand"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"identifier"?: string | null,"machine_type"?: string,"model"?: string | null,"model_year"?: number | null,"name"?: string,"notes"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "machines_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"movement_costs": {
                  Row: {
                    "company_id": string,"movement_id": string,"total_cost": number,"unit_cost": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"movement_id": string,"total_cost"?: number,"unit_cost"?: number
                  }
                  Update: {
                    "company_id"?: string,"movement_id"?: string,"total_cost"?: number,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_movement_costs_movement"
      columns: ["company_id","movement_id"]
isOneToOne: true
      referencedRelation: "stock_movements"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "movement_costs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"operation_idempotency": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string,"expires_at": string,"id": string,"idempotency_key": string,"operation_type": string,"request_hash": string,"response_payload": Json | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by": string,"expires_at"?: string,"id"?: string,"idempotency_key": string,"operation_type": string,"request_hash": string,"response_payload"?: Json | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string,"expires_at"?: string,"id"?: string,"idempotency_key"?: string,"operation_type"?: string,"request_hash"?: string,"response_payload"?: Json | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "operation_idempotency_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "operation_idempotency_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "operation_idempotency_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"product_costs": {
                  Row: {
                    "company_id": string,"cost_price": number,"product_id": string,"updated_at": string,"updated_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"cost_price"?: number,"product_id": string,"updated_at"?: string,"updated_by": string
                  }
                  Update: {
                    "company_id"?: string,"cost_price"?: number,"product_id"?: string,"updated_at"?: string,"updated_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_product_costs_product"
      columns: ["company_id","product_id"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "product_costs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_costs_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_costs_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "barcode": string | null,"category_id": string | null,"company_id": string,"created_at": string,"current_stock": number,"description": string | null,"id": string,"is_active": boolean,"min_stock": number,"name": string,"selling_price": number,"sku": string,"supplier_id": string | null,"unit": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode"?: string | null,"category_id"?: string | null,"company_id": string,"created_at"?: string,"current_stock"?: number,"description"?: string | null,"id"?: string,"is_active"?: boolean,"min_stock"?: number,"name": string,"selling_price"?: number,"sku": string,"supplier_id"?: string | null,"unit"?: string,"updated_at"?: string
                  }
                  Update: {
                    "barcode"?: string | null,"category_id"?: string | null,"company_id"?: string,"created_at"?: string,"current_stock"?: number,"description"?: string | null,"id"?: string,"is_active"?: boolean,"min_stock"?: number,"name"?: string,"selling_price"?: number,"sku"?: string,"supplier_id"?: string | null,"unit"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_products_category"
      columns: ["company_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "fk_products_supplier"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "products_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"purchase_items": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"product_id": string,"purchase_id": string,"quantity": number,"subtotal": number,"unit_cost": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"product_id": string,"purchase_id": string,"quantity": number,"subtotal": number,"unit_cost": number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"product_id"?: string,"purchase_id"?: string,"quantity"?: number,"subtotal"?: number,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_purchase_items_product"
      columns: ["company_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "fk_purchase_items_purchase"
      columns: ["company_id","purchase_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "purchase_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"purchases": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"company_id": string,"created_at": string,"created_by": string,"id": string,"invoice_number": string | null,"notes": string | null,"purchase_date": string,"purchase_number": string,"status": string,"subtotal": number,"supplier_id": string,"total_amount": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"company_id": string,"created_at"?: string,"created_by": string,"id"?: string,"invoice_number"?: string | null,"notes"?: string | null,"purchase_date": string,"purchase_number": string,"status"?: string,"subtotal": number,"supplier_id": string,"total_amount": number
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"invoice_number"?: string | null,"notes"?: string | null,"purchase_date"?: string,"purchase_number"?: string,"status"?: string,"subtotal"?: number,"supplier_id"?: string,"total_amount"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_purchases_supplier"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "purchases_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_items": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"product_id": string,"quantity": number,"sale_id": string,"subtotal": number,"unit_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"product_id": string,"quantity": number,"sale_id": string,"subtotal": number,"unit_price": number
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"product_id"?: string,"quantity"?: number,"sale_id"?: string,"subtotal"?: number,"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_sale_items_product"
      columns: ["company_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "fk_sale_items_sale"
      columns: ["company_id","sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "sale_items_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"company_id": string,"created_at": string,"created_by": string,"customer_id": string | null,"discount": number,"id": string,"notes": string | null,"payments": NonNullable<Json>,"sale_number": string,"status": string,"subtotal": number,"total_amount": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"company_id": string,"created_at"?: string,"created_by": string,"customer_id"?: string | null,"discount"?: number,"id"?: string,"notes"?: string | null,"payments"?: NonNullable<Json>,"sale_number": string,"status"?: string,"subtotal": number,"total_amount": number
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string,"customer_id"?: string | null,"discount"?: number,"id"?: string,"notes"?: string | null,"payments"?: NonNullable<Json>,"sale_number"?: string,"status"?: string,"subtotal"?: number,"total_amount"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_sales_customer"
      columns: ["company_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "sales_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "company_id": string,"created_at": string,"created_by": string,"direction": string,"id": string,"new_stock": number,"notes": string | null,"previous_stock": number,"product_id": string,"quantity": number,"reason": string,"reference_doc": string | null,"reference_purchase_id": string | null,"reference_sale_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"created_by": string,"direction": string,"id"?: string,"new_stock": number,"notes"?: string | null,"previous_stock": number,"product_id": string,"quantity": number,"reason": string,"reference_doc"?: string | null,"reference_purchase_id"?: string | null,"reference_sale_id"?: string | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"created_by"?: string,"direction"?: string,"id"?: string,"new_stock"?: number,"notes"?: string | null,"previous_stock"?: number,"product_id"?: string,"quantity"?: number,"reason"?: string,"reference_doc"?: string | null,"reference_purchase_id"?: string | null,"reference_sale_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_stock_movements_product"
      columns: ["company_id","product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "fk_stock_movements_purchase"
      columns: ["company_id","reference_purchase_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "fk_stock_movements_sale"
      columns: ["company_id","reference_sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "stock_movements_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles_public"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_payments": {
                  Row: {
                    "amount": number,"cash_movement_id": string | null,"company_id": string,"created_at": string,"created_by": string,"id": string,"idempotency_key": string,"notes": string | null,"payments": NonNullable<Json>,"status": string,"supplier_id": string,"void_cash_movement_id": string | null,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"cash_movement_id"?: string | null,"company_id": string,"created_at"?: string,"created_by": string,"id"?: string,"idempotency_key": string,"notes"?: string | null,"payments": NonNullable<Json>,"status"?: string,"supplier_id": string,"void_cash_movement_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"cash_movement_id"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"idempotency_key"?: string,"notes"?: string | null,"payments"?: NonNullable<Json>,"status"?: string,"supplier_id"?: string,"void_cash_movement_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_supplier_payments_supplier"
      columns: ["company_id","supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "supplier_payments_cash_movement_id_fkey"
      columns: ["cash_movement_id"]
isOneToOne: false
      referencedRelation: "cash_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payments_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payments_void_cash_movement_id_fkey"
      columns: ["void_cash_movement_id"]
isOneToOne: false
      referencedRelation: "cash_movements"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "address": string | null,"company_id": string,"contact_name": string | null,"created_at": string,"email": string | null,"id": string,"is_active": boolean,"name": string,"phone": string | null,"tax_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"company_id": string,"contact_name"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"phone"?: string | null,"tax_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"company_id"?: string,"contact_name"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string | null,"tax_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "profiles_public": {
                  Row: {
                    "full_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "full_name"?: string | null,"id"?: string | null
                         }
                        Update: {
                           "full_name"?: string | null,"id"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_company_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"attendance_report":
{ Args: { "p_company_id": string,"p_from": string,"p_to": string }; Returns: {
              "days_worked": number,"employee_id": string,"employee_name": string,"late_count": number,"open_count": number,"scheduled_minutes": number,"worked_minutes": number
            }[]
                           },
"bulk_update_prices":
{ Args: { "p_category_id"?: string,"p_company_id": string,"p_fixed_delta"?: number,"p_percentage"?: number,"p_product_ids"?: (string)[] }; Returns: number
                           },
"cancel_purchase":
{ Args: { "p_company_id": string,"p_purchase_id": string,"p_reason": string }; Returns: Json
                           },
"cancel_sale":
{ Args: { "p_company_id": string,"p_reason": string,"p_sale_id": string }; Returns: Json
                           },
"cash_session_summary":
{ Args: { "p_company_id": string,"p_session_id": string }; Returns: Json
                           },
"clock_in":
{ Args: { "p_company_id": string,"p_employee_id": string }; Returns: string
                           },
"clock_out":
{ Args: { "p_company_id": string,"p_employee_id": string }; Returns: string
                           },
"clock_roster":
{ Args: { "p_company_id": string,"p_since": string,"p_weekday": number }; Returns: {
              "employee_id": string,"full_name": string,"job_title": string,"records": Json,"schedule": Json
            }[]
                           },
"close_cash_session":
{ Args: { "p_company_id": string,"p_counted_amount": number,"p_notes"?: string,"p_session_id": string }; Returns: Json
                           },
"create_company":
{ Args: { "p_currency"?: string,"p_name": string,"p_tax_id": string,"p_timezone"?: string }; Returns: string
                           },
"create_expense":
{ Args: { "p_amount": number,"p_category": string,"p_company_id": string,"p_description": string,"p_expense_date": string,"p_machine_id"?: string,"p_pay_from_cash": boolean,"p_payment_method": string,"p_supplier_id": string }; Returns: Json
                           },
"create_product":
{ Args: { "p_barcode"?: string,"p_category_id"?: string,"p_company_id": string,"p_cost_price"?: number,"p_description"?: string,"p_min_stock"?: number,"p_name": string,"p_selling_price"?: number,"p_sku": string,"p_supplier_id"?: string,"p_unit"?: string }; Returns: string
                           },
"customer_balances":
{ Args: { "p_company_id": string }; Returns: {
              "balance": number,"charged_total": number,"collected_total": number,"customer_id": string,"customer_name": string,"last_activity": string,"oldest_open_since": string
            }[]
                           },
"customer_statement":
{ Args: { "p_company_id": string,"p_customer_id": string }; Returns: {
              "amount": number,"document": string,"kind": string,"occurred_at": string,"reference_id": string
            }[]
                           },
"dashboard_daily_sales":
{ Args: { "p_company_id": string,"p_days": number }; Returns: {
              "cost_total": number,"day": string,"sales_count": number,"sales_total": number
            }[]
                           },
"deactivate_company":
{ Args: { "p_company_id": string }; Returns: undefined
                           },
"deactivate_member":
{ Args: { "p_company_id": string,"p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"financial_summary":
{ Args: { "p_company_id": string,"p_from": string,"p_to": string }; Returns: Json
                           },
"import_initial_stock":
{ Args: { "p_company_id": string,"p_idempotency_key": string,"p_items": Json }; Returns: Json
                           },
"import_products":
{ Args: { "p_company_id": string,"p_on_duplicate"?: string,"p_products": Json }; Returns: number
                           },
"invite_user_to_company":
{ Args: { "p_company_id": string,"p_email": string,"p_role": string }; Returns: string
                           },
"local_today":
{ Args: { "p_company_id": string }; Returns: string
                           },
"machine_costs":
{ Args: { "p_company_id": string,"p_from": string,"p_to": string }; Returns: {
              "expenses_count": number,"fuel_total": number,"machine_id": string,"machine_name": string,"machine_type": string,"maintenance_total": number,"other_total": number,"status": string,"total": number
            }[]
                           },
"open_cash_session":
{ Args: { "p_company_id": string,"p_notes"?: string,"p_opening_amount": number }; Returns: Json
                           },
"process_credit_purchase":
{ Args: { "p_company_id": string,"p_idempotency_key": string,"p_invoice_number"?: string,"p_items": Json,"p_notes"?: string,"p_purchase_date"?: string,"p_supplier_id": string }; Returns: Json
                           },
"process_purchase":
{ Args: { "p_company_id": string,"p_idempotency_key": string,"p_invoice_number"?: string,"p_items": Json,"p_notes"?: string,"p_purchase_date"?: string,"p_supplier_id": string }; Returns: Json
                           },
"process_sale":
{ Args: { "p_company_id": string,"p_customer_id"?: string,"p_discount"?: number,"p_idempotency_key": string,"p_items": Json,"p_notes"?: string,"p_payments"?: Json }; Returns: Json
                           },
"products_with_movements":
{ Args: { "p_company_id": string,"p_product_ids": (string)[] }; Returns: {
              "product_id": string
            }[]
                           },
"purchases_summary":
{ Args: { "p_company_id": string }; Returns: {
              "completed_count": number,"completed_total": number
            }[]
                           },
"reactivate_member":
{ Args: { "p_company_id": string,"p_new_role": string,"p_reason": string,"p_user_id": string }; Returns: undefined
                           },
"register_cash_movement":
{ Args: { "p_amount": number,"p_company_id": string,"p_movement_type": string,"p_reason": string,"p_session_id": string }; Returns: Json
                           },
"register_customer_payment":
{ Args: { "p_company_id": string,"p_customer_id": string,"p_idempotency_key": string,"p_into_cash": boolean,"p_notes": string,"p_payments": Json }; Returns: Json
                           },
"register_physical_count":
{ Args: { "p_company_id": string,"p_counted_quantity": number,"p_idempotency_key": string,"p_notes"?: string,"p_product_id": string,"p_reference_doc"?: string }; Returns: Json
                           },
"register_stock_adjustment":
{ Args: { "p_company_id": string,"p_direction": string,"p_idempotency_key": string,"p_notes"?: string,"p_product_id": string,"p_quantity": number,"p_reason": string,"p_reference_doc"?: string }; Returns: Json
                           },
"register_supplier_payment":
{ Args: { "p_company_id": string,"p_from_cash": boolean,"p_idempotency_key": string,"p_notes": string,"p_payments": Json,"p_supplier_id": string }; Returns: Json
                           },
"report_expenses":
{ Args: { "p_company_id": string,"p_from": string,"p_to": string }; Returns: {
              "category": string,"expenses_count": number,"total": number
            }[]
                           },
"report_inventory_valuation":
{ Args: { "p_company_id": string }; Returns: {
              "cost_price": number,"current_stock": number,"product_id": string,"product_name": string,"selling_price": number,"sku": string,"stock_value": number
            }[]
                           },
"report_sales_by_day":
{ Args: { "p_company_id": string,"p_from": string,"p_to": string }; Returns: {
              "credit_total": number,"discount_total": number,"sale_date": string,"sales_count": number,"total": number
            }[]
                           },
"report_top_products":
{ Args: { "p_company_id": string,"p_from": string,"p_limit": number,"p_to": string }; Returns: {
              "cost": number,"product_id": string,"product_name": string,"quantity": number,"revenue": number,"sku": string
            }[]
                           },
"revoke_company_invitation":
{ Args: { "p_company_id": string,"p_invitation_id": string }; Returns: undefined
                           },
"save_attendance":
{ Args: { "p_check_in": string,"p_check_out": string,"p_company_id": string,"p_employee_id": string,"p_reason": string,"p_record_id": string }; Returns: string
                           },
"set_company_negative_stock_policy":
{ Args: { "p_allow_negative_stock": boolean,"p_company_id": string,"p_reason": string }; Returns: undefined
                           },
"set_employee_schedule":
{ Args: { "p_blocks": Json,"p_company_id": string,"p_employee_id": string }; Returns: number
                           },
"supplier_balances":
{ Args: { "p_company_id": string }; Returns: {
              "balance": number,"charged_total": number,"last_activity": string,"oldest_open_since": string,"paid_total": number,"supplier_id": string,"supplier_name": string
            }[]
                           },
"supplier_statement":
{ Args: { "p_company_id": string,"p_supplier_id": string }; Returns: {
              "amount": number,"document": string,"kind": string,"occurred_at": string,"reference_id": string
            }[]
                           },
"transfer_company_ownership":
{ Args: { "p_company_id": string,"p_new_owner_id": string }; Returns: undefined
                           },
"update_product":
{ Args: { "p_barcode"?: string,"p_category_id"?: string,"p_company_id": string,"p_description"?: string,"p_is_active"?: boolean,"p_min_stock": number,"p_name": string,"p_product_id": string,"p_selling_price": number,"p_sku": string,"p_supplier_id"?: string,"p_unit": string }; Returns: undefined
                           },
"update_product_cost":
{ Args: { "p_company_id": string,"p_cost_price": number,"p_product_id": string }; Returns: undefined
                           },
"upsert_category":
{ Args: { "p_category_id"?: string,"p_company_id": string,"p_description"?: string,"p_is_active"?: boolean,"p_name": string }; Returns: string
                           },
"upsert_customer":
{ Args: { "p_address"?: string,"p_company_id": string,"p_customer_id"?: string,"p_email"?: string,"p_identification_type"?: string,"p_is_active"?: boolean,"p_name": string,"p_notes"?: string,"p_phone"?: string,"p_tax_id"?: string }; Returns: string
                           },
"upsert_employee":
{ Args: { "p_company_id": string,"p_document_number": string,"p_employee_id": string,"p_full_name": string,"p_hire_date": string,"p_job_title": string,"p_notes": string,"p_phone": string,"p_status": string }; Returns: string
                           },
"upsert_machine":
{ Args: { "p_brand": string,"p_company_id": string,"p_identifier": string,"p_machine_id": string,"p_machine_type": string,"p_model": string,"p_model_year": number,"p_name": string,"p_notes": string,"p_status": string }; Returns: string
                           },
"upsert_supplier":
{ Args: { "p_address"?: string,"p_company_id": string,"p_contact_name"?: string,"p_email"?: string,"p_is_active"?: boolean,"p_name": string,"p_phone"?: string,"p_supplier_id"?: string,"p_tax_id"?: string }; Returns: string
                           },
"validate_cuit":
{ Args: { "p_cuit": string }; Returns: boolean
                           },
"void_attendance":
{ Args: { "p_company_id": string,"p_reason": string,"p_record_id": string }; Returns: string
                           },
"void_customer_payment":
{ Args: { "p_company_id": string,"p_payment_id": string,"p_reason": string }; Returns: Json
                           },
"void_expense":
{ Args: { "p_company_id": string,"p_expense_id": string,"p_reason": string }; Returns: Json
                           },
"void_supplier_payment":
{ Args: { "p_company_id": string,"p_payment_id": string,"p_reason": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
