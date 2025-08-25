# Patrimonius Backend

Backend service for **Patrimonius**, the institutional electronic document and records management system developed for the Museo Nacional de Costa Rica.  
The system manages the entire lifecycle of digital documents — from creation, classification, preservation, to secure transfer — in compliance with national (Law 7202, Law 8454) and international archival standards (OAIS, METS, PREMIS, ISO 15489, ISO 23081).

---

## Tech Stack
- **Runtime:** Node.js (LTS)  
- **Framework:** Express.js (RESTful APIs)  
- **Database:** MySQL (relational model with archival metadata)  
- **ORM/Query:** Sequelize (or native SQL queries)  
- **Testing:** Jest (unit/integration)  
- **Version Control:** Git + GitHub  

---

---

## Core Features
- **User & Role Management (HU-001):**  
  Create, update, delete users and assign roles with granular permissions.  

- **Access Control (HU-002 – HU-006):**  
  Restrict document access by role, unit, or confidentiality level.  

- **Document Lifecycle (HU-007 – HU-018):**  
  Create, edit, version control, comment, and digitally sign documents.  

- **Archival & Preservation (HU-019 – HU-032):**  
  Transfer signed documents into conservation with metadata, retention rules, and secure disposal or SIP transfer.  

- **Search & Consultation (HU-024 – HU-028):**  
  Robust queries with filters, previews, download permissions, and search history.  

- **Interoperability (HU-033 – HU-034):**  
  Export OAIS-compliant SIP packages with METS + PREMIS metadata.  

- **Audit & Traceability:**  
  Immutable logs for every action, exportable in XML for audits.  

---

## Installation & Setup
### Prerequisites
- Node.js >= 18.x  
- MySQL >= 8.x  
- Git  

### Clone Repository
```bash
git clone https://github.com/<your-org>/patrimonius-backend.git
cd patrimonius-backend
```

### Install Dependencies
```bash
npm install
```
### Configure Environment
```bash
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=patrimonius
JWT_SECRET=your_jwt_secret
```

### Run Database Migrations

```bash
npm run migrate
```

### Start Development Server

```bash
npm run dev
```

## Contributors

- David Núñez Franco
- María Araya Campos
- Gabriel Herrera Solís
- Alexia Alvarado Alfaro
- Kendra Artavia Caballero
- William Rodríguez Campos

