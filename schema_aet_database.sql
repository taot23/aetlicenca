--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE neondb;
--
-- Name: neondb; Type: DATABASE; Schema: -; Owner: -
--

CREATE DATABASE neondb WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'C.UTF-8';


\connect neondb

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: license_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.license_requests (
    id integer NOT NULL,
    user_id integer NOT NULL,
    transporter_id integer,
    request_number text NOT NULL,
    type text NOT NULL,
    main_vehicle_plate text NOT NULL,
    tractor_unit_id integer,
    first_trailer_id integer,
    dolly_id integer,
    second_trailer_id integer,
    flatbed_id integer,
    length integer NOT NULL,
    additional_plates text[],
    additional_plates_documents text[],
    states text[] NOT NULL,
    status text DEFAULT 'pending_registration'::text NOT NULL,
    state_statuses text[],
    state_files text[],
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    is_draft boolean DEFAULT true NOT NULL,
    comments text,
    license_file_url text DEFAULT ''::text,
    valid_until timestamp without time zone,
    width integer,
    height integer,
    cargo_type text,
    aet_number text,
    state_aet_numbers text[]
);


--
-- Name: license_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.license_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: license_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.license_requests_id_seq OWNED BY public.license_requests.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: status_histories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.status_histories (
    id integer NOT NULL,
    license_id integer NOT NULL,
    state text NOT NULL,
    user_id integer NOT NULL,
    old_status text NOT NULL,
    new_status text NOT NULL,
    comments text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: status_histories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.status_histories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: status_histories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.status_histories_id_seq OWNED BY public.status_histories.id;


--
-- Name: transporters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transporters (
    id integer NOT NULL,
    person_type text NOT NULL,
    name text NOT NULL,
    document_number text NOT NULL,
    email text NOT NULL,
    phone text,
    trade_name text,
    legal_responsible text,
    birth_date text,
    nationality text,
    id_number text,
    id_issuer text,
    id_state text,
    street text,
    number text,
    complement text,
    district text,
    zip_code text,
    city text,
    state text,
    subsidiaries json DEFAULT '[]'::json,
    documents json DEFAULT '[]'::json,
    contact1_name text,
    contact1_phone text,
    contact2_name text,
    contact2_phone text,
    user_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: transporters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transporters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transporters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transporters_id_seq OWNED BY public.transporters.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id integer NOT NULL,
    user_id integer NOT NULL,
    plate text NOT NULL,
    type text NOT NULL,
    brand text,
    model text,
    year integer,
    renavam text,
    tare integer NOT NULL,
    axle_count integer,
    remarks text,
    crlv_year integer NOT NULL,
    crlv_url text,
    status text DEFAULT 'active'::text NOT NULL,
    body_type text
);


--
-- Name: vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehicles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehicles_id_seq OWNED BY public.vehicles.id;


--
-- Name: license_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests ALTER COLUMN id SET DEFAULT nextval('public.license_requests_id_seq'::regclass);


--
-- Name: status_histories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_histories ALTER COLUMN id SET DEFAULT nextval('public.status_histories_id_seq'::regclass);


--
-- Name: transporters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transporters ALTER COLUMN id SET DEFAULT nextval('public.transporters_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vehicles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles ALTER COLUMN id SET DEFAULT nextval('public.vehicles_id_seq'::regclass);


--
-- Name: license_requests license_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_pkey PRIMARY KEY (id);


--
-- Name: license_requests license_requests_request_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_request_number_unique UNIQUE (request_number);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: status_histories status_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_histories
    ADD CONSTRAINT status_histories_pkey PRIMARY KEY (id);


--
-- Name: transporters transporters_document_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transporters
    ADD CONSTRAINT transporters_document_number_unique UNIQUE (document_number);


--
-- Name: transporters transporters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transporters
    ADD CONSTRAINT transporters_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: idx_status_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_history_created_at ON public.status_histories USING btree (created_at);


--
-- Name: idx_status_history_license_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_history_license_id ON public.status_histories USING btree (license_id);


--
-- Name: idx_status_history_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_history_state ON public.status_histories USING btree (state);


--
-- Name: idx_status_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_status_history_user_id ON public.status_histories USING btree (user_id);


--
-- Name: license_requests license_requests_dolly_id_vehicles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_dolly_id_vehicles_id_fk FOREIGN KEY (dolly_id) REFERENCES public.vehicles(id);


--
-- Name: license_requests license_requests_first_trailer_id_vehicles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_first_trailer_id_vehicles_id_fk FOREIGN KEY (first_trailer_id) REFERENCES public.vehicles(id);


--
-- Name: license_requests license_requests_flatbed_id_vehicles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_flatbed_id_vehicles_id_fk FOREIGN KEY (flatbed_id) REFERENCES public.vehicles(id);


--
-- Name: license_requests license_requests_second_trailer_id_vehicles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_second_trailer_id_vehicles_id_fk FOREIGN KEY (second_trailer_id) REFERENCES public.vehicles(id);


--
-- Name: license_requests license_requests_tractor_unit_id_vehicles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_tractor_unit_id_vehicles_id_fk FOREIGN KEY (tractor_unit_id) REFERENCES public.vehicles(id);


--
-- Name: license_requests license_requests_transporter_id_transporters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_transporter_id_transporters_id_fk FOREIGN KEY (transporter_id) REFERENCES public.transporters(id);


--
-- Name: license_requests license_requests_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_requests
    ADD CONSTRAINT license_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: status_histories status_histories_license_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_histories
    ADD CONSTRAINT status_histories_license_id_fkey FOREIGN KEY (license_id) REFERENCES public.license_requests(id);


--
-- Name: status_histories status_histories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.status_histories
    ADD CONSTRAINT status_histories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: transporters transporters_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transporters
    ADD CONSTRAINT transporters_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: vehicles vehicles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: DATABASE neondb; Type: ACL; Schema: -; Owner: -
--

GRANT ALL ON DATABASE neondb TO neon_superuser;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

