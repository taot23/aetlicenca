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

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, email, password, full_name, phone, role, is_admin, created_at) FROM stdin;
1	admin@sistema.com	admin-special-password	Administrador	(11) 99999-9999	admin	t	2025-04-15 11:38:27.347289
2	transportador@teste.com	$2b$10$oDIUQbw08yuv3aX/uAHWoO8BDC5h3l24giiPDZ.iWoKKwS3.AvbW6	Usuário Transportador	(11) 98765-4321	user	f	2025-04-15 11:38:27.347289
3	teste@teste.com	a0c7112b086781e7f6da2132f1894d5a2c0d102d60019471770d23ae96600e8367f6f6af5d98c9b2be48c1a5e2a7c41839d925e3ac8eb60f43574fa26ac01611.da70f8841797ba74f193344c672f59d3	Joao teste	(11) 98765-4321	user	f	2025-04-25 20:04:49.800048
5	operacional02@sistema.com	d11772c10b7d1899bb561bd48eaf70f7141b9511319013e08e4d527424c69eda48d23f9c92c547d22e619574d700db29666e9e3e3c4cb7d4f85ff083790ed0c6.3b26b146b5e74c61d16b8399035341f0	Operacional 02		operational	f	2025-04-29 21:12:57.020241
6	supervisor@sistema.com	cd36b8a5fd25922fa34849e1226af7784eefa3f43e4e91b4152d204efcdc08bb0203e8de5227187d79add6543c3fd3fdc3aab8e02b73b523e6c00fd09f3c63b7.faf6873ce97527103f6ab253b72fa815	Supervidor		supervisor	f	2025-04-29 21:14:14.899044
4	operacional01@sistema.com	fe43e5022793369fb3c068a44af36b65349350fcce4c5d62e2277939a8959569a9853ce43010fae682a8a6498bc933d0d0456170421c7f644cfd87fa42fa5efb.179440800aadbb5811cff92c4712d126	Operacional 01		operational	f	2025-04-29 21:11:56.061599
\.


--
-- Data for Name: transporters; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.transporters (id, person_type, name, document_number, email, phone, trade_name, legal_responsible, birth_date, nationality, id_number, id_issuer, id_state, street, number, complement, district, zip_code, city, state, subsidiaries, documents, contact1_name, contact1_phone, contact2_name, contact2_phone, user_id, created_at) FROM stdin;
1	pj	Transportadora Teste Ltda	12345678000190	contato@transportesteste.com	(11) 3333-4444	Transportes Rápidos	João da Silva	\N	\N	\N	\N	\N	Avenida Brasil	1500	Sala 300	Centro	01000-000	São Paulo	SP	[]	[]	\N	\N	\N	\N	2	2025-04-15 11:38:34.318878
2	pj	FRIBON TRANSPORTES LTDA	10280806000134	teste@teste.com	(11) 98765-4321	FRIBON TRANSPORTES	tedtyr	\N	\N	\N	\N	\N	RODOVIA BR-364	SN	SETOR AREAS PERIFERICAS	VILA RICA	78750541	RONDONOPOLIS	MT	"[]"	"[]"	tedtyr	(11) 98765-4321			3	2025-04-25 15:08:52.386275
\.


--
-- Data for Name: vehicles; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.vehicles (id, user_id, plate, type, brand, model, year, renavam, tare, axle_count, remarks, crlv_year, crlv_url, status, body_type) FROM stdin;
9	2	GHI3F67	semi_trailer	RANDON	SR BA	2023	78542400003	7500	3	Semirreboque graneleiro	2023	\N	active	\N
10	2	JKL4G89	semi_trailer	RANDON	SR BA	2023	78542400004	7500	3	Semirreboque graneleiro	2023	\N	active	\N
11	2	MNO5H01	semi_trailer	RANDON	SR BA	2023	78542400005	7500	3	Semirreboque graneleiro	2023	\N	active	\N
12	2	PQR6I23	semi_trailer	RANDON	SR BA	2023	78542400006	7500	3	Semirreboque graneleiro	2023	\N	active	\N
13	2	STU7J45	semi_trailer	RANDON	SR BA	2023	78542400007	7500	3	Semirreboque graneleiro	2023	\N	active	\N
14	2	VWX8K67	semi_trailer	RANDON	SR BA	2023	78542400008	7500	3	Semirreboque graneleiro	2023	\N	active	\N
15	2	YZA9L89	semi_trailer	RANDON	SR BA	2023	78542400009	7500	3	Semirreboque graneleiro	2023	\N	active	\N
16	2	BCD1M01	semi_trailer	RANDON	SR BA	2023	78542400010	7500	3	Semirreboque graneleiro	2023	\N	active	\N
17	2	EFG2N23	semi_trailer	RANDON	SR BA	2023	78542400011	7500	3	Semirreboque graneleiro	2023	\N	active	\N
18	2	HIJ3O45	semi_trailer	RANDON	SR BA	2023	78542400012	7500	3	Semirreboque graneleiro	2023	\N	active	\N
19	2	KLM4P67	semi_trailer	RANDON	SR BA	2023	78542400013	7500	3	Semirreboque graneleiro	2023	\N	active	\N
20	2	NOP5Q89	semi_trailer	RANDON	SR BA	2023	78542400014	7500	3	Semirreboque graneleiro	2023	\N	active	\N
21	2	QRS6R01	semi_trailer	RANDON	SR BA	2023	78542400015	7500	3	Semirreboque graneleiro	2023	\N	active	\N
22	2	TUV7S23	semi_trailer	RANDON	SR BA	2023	78542400016	7500	3	Semirreboque graneleiro	2023	\N	active	\N
23	2	WXY8T45	semi_trailer	RANDON	SR BA	2023	78542400017	7500	3	Semirreboque graneleiro	2023	\N	active	\N
24	2	ZAB9U67	semi_trailer	RANDON	SR BA	2023	78542400018	7500	3	Semirreboque graneleiro	2023	\N	active	\N
25	2	CDE1V89	semi_trailer	RANDON	SR BA	2023	78542400019	7500	3	Semirreboque graneleiro	2023	\N	active	\N
28	2	RAU8H04	semi_trailer	RANDON	SR BA	2025	\N	7	\N	\N	2025	\N	active	\N
26	2	RAU8G84	semi_trailer	RANDON	SR BA	2018	98765432101	7000	2		2022	\N	active	\N
30	2	QWE2536	flatbed	RANDON	SR BA	2024	123456	7500	2	\N	2025	\N	active	\N
2	2	XYZ5678	semi_trailer	RANDON	SR BA	2018	98765432101	7000	3	Semirreboque graneleiro	2022	\N	active	dump
31	3	REQ3252	tractor_unit	scani	540	2024	0001215151	9890	3	\N	2025	\N	active	\N
32	3	QWE1234	flatbed	FACCHINI	SR CA	2021	45678912301	7000	3	\N	2024	\N	active	\N
1	2	ABC1234	tractor_unit	SCANIA	R450	2020	12345678901	9000	3	Cavalo mecânico em bom estado	2023	\N	active	\N
3	2	DEF9012	semi_trailer	FACCHINI	SR CA	2019	45678912301	6500	2	Semirreboque carga seca	2021	/uploads/crlvFile-1747243701552-856062950.pdf	active	\N
6	2	SBG9L01	semi_trailer	RANDON	SR BA	2023	78542400058	7500	3	Semirreboque graneleiro	2023	/uploads/crlvFile-1747243710442-514601599.pdf	active	\N
8	2	DEF2E45	semi_trailer	RANDON	SR BA	2023	78542400002	7500	3	Semirreboque graneleiro	2023	/uploads/crlvFile-1747243736129-348585249.pdf	active	\N
7	2	ABC1D23	flatbed	RANDON	SR BA	2023	78542400001	7500	3	Semirreboque graneleiro	2023	\N	active	\N
\.


--
-- Data for Name: license_requests; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.license_requests (id, user_id, transporter_id, request_number, type, main_vehicle_plate, tractor_unit_id, first_trailer_id, dolly_id, second_trailer_id, flatbed_id, length, additional_plates, additional_plates_documents, states, status, state_statuses, state_files, created_at, updated_at, is_draft, comments, license_file_url, valid_until, width, height, cargo_type, aet_number, state_aet_numbers) FROM stdin;
63	2	1	AET-2025-5473	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP,DNIT}	approved	{SP:approved:2025-06-26,DNIT:approved:2025-05-31}	{SP:/uploads/stateFile-1747250644155-396345035.pdf,DNIT:/uploads/stateFile-1747258222757-233312162.pdf}	2025-05-14 19:23:38.163	2025-05-14 21:30:23.111	f		/uploads/stateFile-1747258222757-233312162.pdf	2025-05-31 00:00:00	260	440	dry_cargo	434343	{SP:434343,DNIT:434343}
91	1	1	AET-2025-4539	bitrain_9_axles	ABC1234	1	23	\N	18	\N	1980	{}	{}	{MS}	pending_registration	{}	{}	2025-05-16 14:33:21.023	2025-05-16 14:33:21.023	f		\N	\N	260	440	dry_cargo	\N	\N
90	1	1	AET-2025-8550	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP}	pending_registration	{}	{}	2025-05-16 14:04:54.196	2025-05-16 14:05:09.811	f	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	dry_cargo	\N	\N
92	1	1	AET-2025-7877	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP}	pending_registration	{}	{}	2025-05-16 14:33:44.236	2025-05-16 14:33:54.661	f	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	dry_cargo	\N	\N
88	1	2	AET-2025-6604	bitrain_9_axles	ABC1234	1	18	\N	19	\N	2500	{}	{}	{SC}	pending_registration	{SC:registration_in_progress}	{}	2025-05-15 22:15:48.027	2025-05-16 20:01:50.959	f		\N	\N	260	440	liquid_cargo	\N	{}
93	1	1	AET-2025-7549	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{PE,MT,PA}	pending_registration	{}	{}	2025-05-16 14:34:33.034	2025-05-16 14:34:43.298	f	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	dry_cargo	\N	\N
94	1	2	AET-2025-8861	bitrain_6_axles	REQ3252	31	17	\N	19	\N	1980	{}	{}	{MG,RS}	pending_registration	{}	{}	2025-05-16 15:41:32.249	2025-05-16 15:41:32.249	f		\N	\N	260	440	liquid_cargo	\N	\N
97	1	1	AET-2025-8997	bitrain_9_axles	REQ3252	31	18	\N	17	\N	1980	{}	{}	{SC,DF}	pending_registration	{}	{}	2025-05-16 17:33:48.879	2025-05-16 17:33:48.879	f		\N	\N	3	4	liquid_cargo	\N	\N
98	1	2	AET-2025-2954	bitrain_9_axles	REQ3252	31	18	\N	19	\N	2500	{}	{}	{SC,DF}	pending_registration	{SC:registration_in_progress}	{}	2025-05-16 17:59:08.423	2025-05-16 20:02:27.249	f		\N	\N	260	440	liquid_cargo	\N	{}
96	1	1	AET-2025-4864	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP}	pending_registration	{}	{}	2025-05-16 17:30:56.087	2025-05-16 18:01:12.692	f	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	dry_cargo	\N	\N
100	1	1	AET-2025-3948	bitrain_7_axles	REQ3252	31	10	\N	10	32	1980	{}	{}	{BA,RS}	pending_registration	{BA:registration_in_progress,RS:rejected}	{}	2025-05-16 18:33:48.446	2025-05-16 19:54:28.508	f		\N	\N	260	440	liquid_cargo	\N	{}
103	1	1	AET-2025-1869	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP}	pending_registration	{SP:rejected}	{}	2025-05-16 19:48:57.508	2025-05-16 20:02:37.786	f	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	dry_cargo	\N	{}
99	1	2	AET-2025-8197	bitrain_9_axles	REQ3252	31	16	\N	20	\N	2500	{}	{}	{BA,PA}	pending_registration	{BA:under_review,PA:rejected}	{}	2025-05-16 18:28:15.61	2025-05-16 19:56:24.036	f		\N	\N	260	440	liquid_cargo	efsdfsdf	{BA:efsdfsdf}
105	1	1	AET-2025-6099	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP}	pending_registration	{}	{}	2025-05-16 20:36:24.085	2025-05-16 20:36:40.102	f	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	dry_cargo	\N	\N
104	1	1	AET-2025-8573	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{SDF9653}	{""}	{SP,DF,SC}	pending_registration	{}	{}	2025-05-16 20:12:16.127	2025-05-16 20:36:15.205	f	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	liquid_cargo	\N	\N
108	2	1	AET-2025-3663	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP}	pending_registration	{}	{}	2025-05-16 21:49:39.888	2025-05-16 21:49:39.888	t	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	dry_cargo	\N	\N
106	2	1	AET-2025-7886	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP}	pending_registration	{}	{}	2025-05-16 21:46:19.356	2025-05-16 21:54:07.461	f	Renovação da licença AET-2025-5473 para o estado SP	\N	\N	260	440	dry_cargo	\N	\N
107	2	1	AET-2025-1857	bitrain_9_axles	ABC1234	1	10	\N	10	\N	2500	{}	{}	{SP,TO,PA}	pending_registration	{SP:registration_in_progress,TO:rejected,PA:approved:2025-07-17}	{PA:/uploads/stateFile-1747433498572-29221828.pdf}	2025-05-16 21:47:07.906	2025-05-16 22:11:38.87	f	Renovação da licença AET-2025-5473 para o estado SP	/uploads/stateFile-1747433498572-29221828.pdf	2025-07-17 00:00:00	260	440	liquid_cargo	12312	{PA:12312}
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.session (sid, sess, expire) FROM stdin;
ngbTN50xM7NbJbHrkAzANxXO7_YHHXPv	{"cookie":{"originalMaxAge":86400000,"expires":"2025-05-20T21:19:30.682Z","secure":false,"httpOnly":true,"path":"/"},"passport":{"user":1}}	2025-05-21 02:02:14
\.


--
-- Data for Name: status_histories; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.status_histories (id, license_id, state, user_id, old_status, new_status, comments, created_at) FROM stdin;
15	63	SP	1	pending	approved	\N	2025-05-14 19:24:04.799
16	63	DNIT	1	pending	approved	\N	2025-05-14 21:30:23.137
20	100	BA	1	pending	registration_in_progress	\N	2025-05-16 19:54:22.153
21	100	RS	1	pending	rejected	\N	2025-05-16 19:54:28.53
22	103	SP	1	pending	registration_in_progress	\N	2025-05-16 19:55:52.252
23	99	BA	1	pending	under_review	\N	2025-05-16 19:56:16.7
24	99	PA	1	pending	rejected	aasadsa	2025-05-16 19:56:24.058
25	88	SC	1	pending	registration_in_progress	\N	2025-05-16 20:01:50.98
26	98	SC	1	pending	registration_in_progress	\N	2025-05-16 20:02:27.31
27	103	SP	1	registration_in_progress	rejected	\N	2025-05-16 20:02:37.81
28	107	SP	1	pending	registration_in_progress	\N	2025-05-16 22:09:41.854
29	107	TO	1	pending	rejected	sazzsfczsc	2025-05-16 22:09:49.461
30	107	PA	1	pending	pending_approval	asdas	2025-05-16 22:10:02.996
31	107	PA	1	pending_approval	approved	\N	2025-05-16 22:11:38.894
\.


--
-- Name: license_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.license_requests_id_seq', 108, true);


--
-- Name: status_histories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.status_histories_id_seq', 31, true);


--
-- Name: transporters_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.transporters_id_seq', 2, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 6, true);


--
-- Name: vehicles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.vehicles_id_seq', 32, true);


--
-- PostgreSQL database dump complete
--

