<!-- @format -->

# Valley Secrets 🏔️✨

Valley Secrets is a full-stack interactive digital curation guide dedicated entirely to mapping out the lesser-known, highly authentic hidden locations across the Kathmandu Valley (**Kathmandu, Bhaktapur, and Lalitpur**).

The platform allows domestic travelers, youth, and expats to move past mainstream tourist blogs and discover quiet ancient courtyards, family-run Newari eateries, artisan culture alleys, and hidden panoramic viewpoints.

---

## 🌟 Core Features

### 🌍 Visitor Experience (Public UI)

- **Tri-City Hidden Gem Exploration:** Filter through curated destination cards based on specific valley city sub-districts (Kathmandu, Lalitpur, or Bhaktapur).
- **Automatic Route Planners:** Every hidden gem card includes a single-click action hook that parses saved coordinate points (Latitude & Longitude) and launches live **Google Maps Directions** instantly.
- **Community Interaction Hub:** Visitors can log star ratings (1 to 5 stars) and submit write-ups, reviews, or travel tips regarding their experiences.
- **Visitor Accounts Portal:** Seamless profile creation (Username, Email, and Password). Signed-in members have their custom usernames stamped on their reviews, while their emails remain private.

### 🔐 Administrative Control Center (Admin Panel)

- **Secured Management Toggle:** Administrative privileges are guarded by an authentication wall. Logging in instantly unlocks a management terminal dashboard directly on the sidebar.
- **Content Lifecycle Curation (CRUD):** Admins can seamlessly post new locations, update existing listings, swap photo asset URLs, input precise spatial coordinates, and delete out-of-date records.
- **Static Internal Security Core:** Hardcoded system parameters ensure fast deployment access for local sandbox iterations without terminal script configurations.

---

## 🏗️ Technical Stack

- **Frontend UI Layer:** Single-Page Interface running on vanilla **HTML5**, **JavaScript (ES6 Async-Fetch API)**, and **Tailwind CSS**.
- **Backend REST Engine:** **Java 17** backed by **Spring Boot**, exposing secure data routing controllers.
- **Database Management:** Relational **H2 Database Engine** running an automatic local persistence scheme. Data is saved directly to your machine's local user profile folder at `~/.valley-secrets/secretsdb`.

---

## 🔐 Preconfigured Master Credentials

Administrative controls are locked out-of-the-box. To modify locations, map profiles, or draft location updates, use these exact verification metrics inside the **Admin Portal** login screen modal:

- **Admin ID / Username:** `smriti_admin`
- **Password Phrase:** `KathmanduSecrets2026!`

---

## 🚀 Setting Up & Running inside VS Code

### 1. Requirements Checklist

- **Java JDK 17** or higher installed on your computer.
- **Visual Studio Code** with the _Extension Pack for Java_ and _Live Server_ extensions active.

### 2. Booting the Java Microservices Server

1. Open the project folder in VS Code.
2. Navigate to `backend-java/src/main/java/com/project/Application.java`.
3. Click the small **Run** button hovering directly above the `main` method.
4. Keep the terminal running. The console will report: `Tomcat started on port 8080 (http)`.

### 3. Launching the Interactive Frontend

1. Open the `frontend-ui/` folder inside the VS Code explorer tree.
2. Right-click on **`index.html`**.
3. Select **Open with Live Server**.
4. Your browser will launch the operational interface instantly. You can now register visitors, post comments, log into the admin module, and map out the Kathmandu Valley!
   Use code with caution.
   Now that your project structure, codebase, and documentation are fully aligned, what should we build next?
   • Would you like to add an interactive visual map layer (using Leaflet.js tiles) so users can see pins dropped over Kathmandu, Lalitpur, and Bhaktapur?
   • Or should we implement an Admin review moderation dashboard so you can delete inappropriate comments left by visitors?

## ✦ System Architecture & Core Stack

The platform leverages a hybrid technological landscape to balance computational power with responsive user interfaces:

- **Backend Architecture** — Engineered with **Java**, driving the heavy data processing, computational pipelines, and core business logic.
- **Application Engine & Scripting** — Powered by **JavaScript**, handling dynamic runtime execution and asynchronous operations.
- **Web Framework Ecosystem** — Implemented using modern **HTML5 & CSS3** styling layers for a polished, minimalist visual interface.
- **Version Pipelines** — Tracked via **Git** and hosted securely within the **GitHub** ecosystem.

---

## ✦ Administrative Gateway

To access the administrative configuration vault dashboard, launch the local platform service instances and connect through the authentication endpoint.

### Access Credentials (Staging Environment Only)

- **Administrative Identity:** `admin`
- **Secure Access Passkey:** `ValleySecrets2026`

> **⚠️ Security Warning:** If you choose to publish this project as a **Public** repository on GitHub, anyone will be able to see these credentials. For public repositories, it is highly recommended to remove these lines and use environment variables (`.env` or `application.properties`) instead.

---

## ✦ Local Installation & Initiation

### Prerequisites

Ensure your local workstation is equipped with a Java Development Kit (JDK), Node.js runtime, and Git.

### Launch Procedure

Initialize the codebase locally by running these setup tasks:

```bash
# Clone the vault architecture
git clone https://github.com

# Enter the threshold
cd ValleySecrets2026

# Compile the Java framework & install JavaScript assets
mvn clean install && npm install

# Run the Secret Valley system application
npm run start
```

---

## ✦ License

Crafted under the prestigious **MIT License**. Refined for creators worldwide.
