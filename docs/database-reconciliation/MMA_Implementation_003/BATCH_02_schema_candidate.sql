-- MMA PROFESSIONAL / BATCH 2 / ADDITIVE SCHEMA CANDIDATE
-- Local-only integration. NEVER APPLY TO HOSTED DATABASE WITHOUT POSTGRES REPLAY + APPROVAL.
-- Based on vetted 159-migration reference, not a final privileges or business-rule decision.
-- Every newly created table is RLS ENABLED, and NO client grants/policies are added here.
-- Existing Professional staging-only tables are not altered or dropped.
-- This script is a candidate to be replayed IN ORDER against a disposable staging reconstruction.
-- Dependencies in existing staging and managed schemas (auth/extensions/storage) must be satisfied.

-- SOURCE CREATE TABLE enterprise_billing_accounts
CREATE TABLE public.enterprise_billing_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    billing_contact_email text NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    unit_amount_cents integer NOT NULL,
    billing_interval text NOT NULL,
    stripe_customer_id text,
    stripe_checkout_session_id text,
    stripe_subscription_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enterprise_billing_accounts_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text]))),
    CONSTRAINT enterprise_billing_accounts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'incomplete'::text]))),
    CONSTRAINT enterprise_billing_accounts_unit_amount_cents_check CHECK ((unit_amount_cents >= 0))
);

ALTER TABLE public.enterprise_billing_accounts ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE enterprise_billing_events
CREATE TABLE public.enterprise_billing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_event_id text NOT NULL,
    event_type text NOT NULL,
    billing_account_id uuid,
    payload jsonb NOT NULL,
    processed_at timestamp with time zone
);

ALTER TABLE public.enterprise_billing_events ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE enterprise_contracts
CREATE TABLE public.enterprise_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    contract_type text NOT NULL,
    template_version text NOT NULL,
    signatory_name text NOT NULL,
    signatory_title text,
    status text DEFAULT 'draft'::text NOT NULL,
    presented_at timestamp with time zone,
    execution_method text,
    execution_evidence_reference text,
    executed_by uuid,
    executed_at timestamp with time zone,
    voided_reason text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supersedes_contract_id uuid,
    CONSTRAINT enterprise_contracts_contract_type_check CHECK ((contract_type = ANY (ARRAY['saas_license'::text, 'baa'::text, 'dpa'::text]))),
    CONSTRAINT enterprise_contracts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'presented'::text, 'executed'::text, 'void'::text])))
);

ALTER TABLE public.enterprise_contracts ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE enterprise_license_sequences
CREATE TABLE public.enterprise_license_sequences (
    year integer NOT NULL,
    prefix text NOT NULL,
    next_value integer DEFAULT 0 NOT NULL
);

ALTER TABLE public.enterprise_license_sequences ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE organization_amendment_requests
CREATE TABLE public.organization_amendment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    request_type text NOT NULL,
    requested_details jsonb DEFAULT '{}'::jsonb NOT NULL,
    director_notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    resulting_quote_id uuid,
    platform_owner_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_amendment_requests_request_type_check CHECK ((request_type = ANY (ARRAY['expansion'::text, 'renewal'::text, 'downgrade'::text, 'cancellation'::text]))),
    CONSTRAINT organization_amendment_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'quoted'::text, 'rejected'::text, 'withdrawn'::text, 'completed'::text])))
);

ALTER TABLE public.organization_amendment_requests ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE sales_prospects
CREATE TABLE public.sales_prospects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_name text NOT NULL,
    contact_email text NOT NULL,
    contact_phone text,
    prospective_organization_name text NOT NULL,
    notes text,
    status text DEFAULT 'new'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_prospects_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'quoted'::text, 'won'::text, 'lost'::text])))
);

ALTER TABLE public.sales_prospects ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE sales_quote_invitations
CREATE TABLE public.sales_quote_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_id uuid NOT NULL,
    recipient_email text NOT NULL,
    token_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid NOT NULL,
    accepted_by uuid,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_quote_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])))
);

ALTER TABLE public.sales_quote_invitations ENABLE ROW LEVEL SECURITY;

-- SOURCE CREATE TABLE sales_quotes
CREATE TABLE public.sales_quotes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prospect_id uuid NOT NULL,
    package_type text NOT NULL,
    proposed_licensed_seats integer NOT NULL,
    proposed_covered_patient_capacity integer NOT NULL,
    annual_license_fee numeric(10,2),
    billing_cadence text,
    quote_term_months integer,
    discount_notes text,
    valid_until timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    supersedes_quote_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_quotes_package_type_check CHECK ((package_type = ANY (ARRAY['integrated_care'::text, 'therapist'::text]))),
    CONSTRAINT sales_quotes_proposed_covered_patient_capacity_check CHECK ((proposed_covered_patient_capacity >= 0)),
    CONSTRAINT sales_quotes_proposed_licensed_seats_check CHECK ((proposed_licensed_seats > 0)),
    CONSTRAINT sales_quotes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'expired'::text, 'revoked'::text, 'superseded'::text])))
);

ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;

-- CONSTRAINT: enterprise_billing_accounts enterprise_billing_accounts_pkey
ALTER TABLE ONLY public.enterprise_billing_accounts
    ADD CONSTRAINT enterprise_billing_accounts_pkey PRIMARY KEY (id);

-- CONSTRAINT: enterprise_billing_accounts enterprise_billing_accounts_quote_id_key
ALTER TABLE ONLY public.enterprise_billing_accounts
    ADD CONSTRAINT enterprise_billing_accounts_quote_id_key UNIQUE (quote_id);

-- CONSTRAINT: enterprise_billing_events enterprise_billing_events_pkey
ALTER TABLE ONLY public.enterprise_billing_events
    ADD CONSTRAINT enterprise_billing_events_pkey PRIMARY KEY (id);

-- CONSTRAINT: enterprise_billing_events enterprise_billing_events_stripe_event_id_key
ALTER TABLE ONLY public.enterprise_billing_events
    ADD CONSTRAINT enterprise_billing_events_stripe_event_id_key UNIQUE (stripe_event_id);

-- CONSTRAINT: enterprise_contracts enterprise_contracts_pkey
ALTER TABLE ONLY public.enterprise_contracts
    ADD CONSTRAINT enterprise_contracts_pkey PRIMARY KEY (id);

-- CONSTRAINT: enterprise_license_sequences enterprise_license_sequences_pkey
ALTER TABLE ONLY public.enterprise_license_sequences
    ADD CONSTRAINT enterprise_license_sequences_pkey PRIMARY KEY (year, prefix);

-- CONSTRAINT: organization_amendment_requests organization_amendment_requests_pkey
ALTER TABLE ONLY public.organization_amendment_requests
    ADD CONSTRAINT organization_amendment_requests_pkey PRIMARY KEY (id);

-- CONSTRAINT: sales_prospects sales_prospects_pkey
ALTER TABLE ONLY public.sales_prospects
    ADD CONSTRAINT sales_prospects_pkey PRIMARY KEY (id);

-- CONSTRAINT: sales_quote_invitations sales_quote_invitations_pkey
ALTER TABLE ONLY public.sales_quote_invitations
    ADD CONSTRAINT sales_quote_invitations_pkey PRIMARY KEY (id);

-- CONSTRAINT: sales_quote_invitations sales_quote_invitations_token_hash_key
ALTER TABLE ONLY public.sales_quote_invitations
    ADD CONSTRAINT sales_quote_invitations_token_hash_key UNIQUE (token_hash);

-- CONSTRAINT: sales_quotes sales_quotes_pkey
ALTER TABLE ONLY public.sales_quotes
    ADD CONSTRAINT sales_quotes_pkey PRIMARY KEY (id);

-- FK enterprise_billing_accounts enterprise_billing_accounts_created_by_fkey
ALTER TABLE ONLY public.enterprise_billing_accounts
    ADD CONSTRAINT enterprise_billing_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- FK enterprise_billing_accounts enterprise_billing_accounts_quote_id_fkey
ALTER TABLE ONLY public.enterprise_billing_accounts
    ADD CONSTRAINT enterprise_billing_accounts_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.sales_quotes(id);

-- FK enterprise_billing_events enterprise_billing_events_billing_account_id_fkey
ALTER TABLE ONLY public.enterprise_billing_events
    ADD CONSTRAINT enterprise_billing_events_billing_account_id_fkey FOREIGN KEY (billing_account_id) REFERENCES public.enterprise_billing_accounts(id);

-- FK enterprise_contracts enterprise_contracts_created_by_fkey
ALTER TABLE ONLY public.enterprise_contracts
    ADD CONSTRAINT enterprise_contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- FK enterprise_contracts enterprise_contracts_executed_by_fkey
ALTER TABLE ONLY public.enterprise_contracts
    ADD CONSTRAINT enterprise_contracts_executed_by_fkey FOREIGN KEY (executed_by) REFERENCES public.profiles(id);

-- FK enterprise_contracts enterprise_contracts_quote_id_fkey
ALTER TABLE ONLY public.enterprise_contracts
    ADD CONSTRAINT enterprise_contracts_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.sales_quotes(id);

-- FK enterprise_contracts enterprise_contracts_supersedes_contract_id_fkey
ALTER TABLE ONLY public.enterprise_contracts
    ADD CONSTRAINT enterprise_contracts_supersedes_contract_id_fkey FOREIGN KEY (supersedes_contract_id) REFERENCES public.enterprise_contracts(id);

-- FK organization_amendment_requests organization_amendment_requests_organization_id_fkey
ALTER TABLE ONLY public.organization_amendment_requests
    ADD CONSTRAINT organization_amendment_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- FK organization_amendment_requests organization_amendment_requests_requested_by_fkey
ALTER TABLE ONLY public.organization_amendment_requests
    ADD CONSTRAINT organization_amendment_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);

-- FK organization_amendment_requests organization_amendment_requests_resulting_quote_id_fkey
ALTER TABLE ONLY public.organization_amendment_requests
    ADD CONSTRAINT organization_amendment_requests_resulting_quote_id_fkey FOREIGN KEY (resulting_quote_id) REFERENCES public.sales_quotes(id);

-- FK organization_amendment_requests organization_amendment_requests_reviewed_by_fkey
ALTER TABLE ONLY public.organization_amendment_requests
    ADD CONSTRAINT organization_amendment_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);

-- FK sales_prospects sales_prospects_created_by_fkey
ALTER TABLE ONLY public.sales_prospects
    ADD CONSTRAINT sales_prospects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- FK sales_quote_invitations sales_quote_invitations_accepted_by_fkey
ALTER TABLE ONLY public.sales_quote_invitations
    ADD CONSTRAINT sales_quote_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.profiles(id);

-- FK sales_quote_invitations sales_quote_invitations_created_by_fkey
ALTER TABLE ONLY public.sales_quote_invitations
    ADD CONSTRAINT sales_quote_invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- FK sales_quote_invitations sales_quote_invitations_quote_id_fkey
ALTER TABLE ONLY public.sales_quote_invitations
    ADD CONSTRAINT sales_quote_invitations_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.sales_quotes(id) ON DELETE CASCADE;

-- FK sales_quotes sales_quotes_created_by_fkey
ALTER TABLE ONLY public.sales_quotes
    ADD CONSTRAINT sales_quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

-- FK sales_quotes sales_quotes_prospect_id_fkey
ALTER TABLE ONLY public.sales_quotes
    ADD CONSTRAINT sales_quotes_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.sales_prospects(id) ON DELETE CASCADE;

-- FK sales_quotes sales_quotes_supersedes_quote_id_fkey
ALTER TABLE ONLY public.sales_quotes
    ADD CONSTRAINT sales_quotes_supersedes_quote_id_fkey FOREIGN KEY (supersedes_quote_id) REFERENCES public.sales_quotes(id);
