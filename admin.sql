-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_user (
  id integer NOT NULL DEFAULT nextval('admin_user_id_seq'::regclass),
  email character varying NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_user_pkey PRIMARY KEY (id)
);
CREATE TABLE public.customer_order (
  id integer NOT NULL DEFAULT nextval('customer_order_id_seq'::regclass),
  restaurant_id integer NOT NULL,
  customer_email character varying NOT NULL,
  order_type character varying NOT NULL,
  delivery_address text,
  payment_method character varying NOT NULL,
  payment_status character varying NOT NULL,
  payment_transaction_id character varying,
  order_status character varying NOT NULL,
  subtotal_amount integer NOT NULL,
  commission_rate double precision NOT NULL,
  commission_amount integer NOT NULL,
  total_amount integer NOT NULL,
  note text,
  created_at timestamp without time zone NOT NULL,
  updated_at timestamp without time zone NOT NULL,
  CONSTRAINT customer_order_pkey PRIMARY KEY (id),
  CONSTRAINT customer_order_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id)
);
CREATE TABLE public.customer_order_item (
  id integer NOT NULL DEFAULT nextval('customer_order_item_id_seq'::regclass),
  order_id integer NOT NULL,
  menu_item_id integer,
  item_name character varying NOT NULL,
  unit_price integer NOT NULL,
  quantity integer NOT NULL,
  line_total integer NOT NULL,
  CONSTRAINT customer_order_item_pkey PRIMARY KEY (id),
  CONSTRAINT customer_order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.customer_order(id),
  CONSTRAINT customer_order_item_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_item(id)
);
CREATE TABLE public.location_visit (
  id integer NOT NULL DEFAULT nextval('location_visit_id_seq'::regclass),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  duration_seconds integer NOT NULL,
  restaurant_id integer,
  timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT location_visit_pkey PRIMARY KEY (id),
  CONSTRAINT fk_location_visit_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id)
);
CREATE TABLE public.menu_item (
  id integer NOT NULL DEFAULT nextval('menu_item_id_seq'::regclass),
  name character varying NOT NULL,
  price integer NOT NULL,
  restaurant_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  image_url text,
  CONSTRAINT menu_item_pkey PRIMARY KEY (id),
  CONSTRAINT fk_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id)
);
CREATE TABLE public.order_item (
  id integer NOT NULL DEFAULT nextval('order_item_id_seq'::regclass),
  order_id integer NOT NULL,
  menu_item_id integer NOT NULL,
  quantity integer NOT NULL,
  price integer NOT NULL,
  CONSTRAINT order_item_pkey PRIMARY KEY (id),
  CONSTRAINT fk_order_item_order FOREIGN KEY (order_id) REFERENCES public.order_table(id),
  CONSTRAINT fk_order_item_menu FOREIGN KEY (menu_item_id) REFERENCES public.menu_item(id)
);
CREATE TABLE public.order_table (
  id integer NOT NULL DEFAULT nextval('order_table_id_seq'::regclass),
  customer_id uuid NOT NULL,
  restaurant_id integer NOT NULL,
  status character varying DEFAULT 'PENDING'::character varying,
  payment_method character varying DEFAULT 'COD'::character varying,
  total_price integer NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_table_pkey PRIMARY KEY (id),
  CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES public.user_profile(id),
  CONSTRAINT fk_order_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id)
);
CREATE TABLE public.payment (
  id integer NOT NULL DEFAULT nextval('payment_id_seq'::regclass),
  order_id integer NOT NULL,
  method character varying NOT NULL,
  status character varying DEFAULT 'PENDING'::character varying,
  amount integer NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payment_pkey PRIMARY KEY (id),
  CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES public.order_table(id)
);
CREATE TABLE public.restaurant (
  id integer NOT NULL DEFAULT nextval('restaurant_id_seq'::regclass),
  name character varying NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  description text,
  avg_eat_time integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  poi_radius_km double precision NOT NULL DEFAULT 0.015,
  visit_count integer NOT NULL DEFAULT 0,
  avg_visit_duration integer NOT NULL DEFAULT 0,
  avg_audio_duration integer NOT NULL DEFAULT 0,
  audio_play_count integer DEFAULT 0,
  owner_id uuid,
  commission_rate integer DEFAULT 10,
  owner_username character varying,
  owner_password_hash character varying,
  owner_password_plain character varying,
  CONSTRAINT restaurant_pkey PRIMARY KEY (id),
  CONSTRAINT fk_restaurant_owner FOREIGN KEY (owner_id) REFERENCES public.user_profile(id)
);
CREATE TABLE public.restaurant_image (
  id integer NOT NULL DEFAULT nextval('restaurant_image_id_seq'::regclass),
  restaurant_id integer NOT NULL,
  image_url text NOT NULL,
  caption text,
  display_order integer DEFAULT 0,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT restaurant_image_pkey PRIMARY KEY (id),
  CONSTRAINT fk_restaurant_image_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id)
);
CREATE TABLE public.restaurant_tag (
  id integer NOT NULL DEFAULT nextval('restaurant_tag_id_seq'::regclass),
  restaurant_id integer NOT NULL,
  tag_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT restaurant_tag_pkey PRIMARY KEY (id),
  CONSTRAINT fk_restaurant_tag_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id),
  CONSTRAINT fk_restaurant_tag_tag FOREIGN KEY (tag_id) REFERENCES public.tag(id)
);
CREATE TABLE public.settlement (
  id integer NOT NULL DEFAULT nextval('settlement_id_seq'::regclass),
  restaurant_id integer NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  total_orders integer DEFAULT 0,
  commission integer DEFAULT 0,
  status character varying DEFAULT 'PENDING'::character varying,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT settlement_pkey PRIMARY KEY (id),
  CONSTRAINT fk_settlement_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id)
);
CREATE TABLE public.tag (
  id integer NOT NULL DEFAULT nextval('tag_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  icon character varying,
  color character varying,
  description text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tag_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_profile (
  id uuid NOT NULL,
  name character varying,
  role character varying CHECK (role::text = ANY (ARRAY['customer'::character varying, 'owner'::character varying]::text[])),
  restaurant_id integer,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_profile_pkey PRIMARY KEY (id),
  CONSTRAINT fk_user_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id)
);