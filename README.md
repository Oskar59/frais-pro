# 🚗 Frais Pro — Suivi de déplacements professionnels

Application web statique de suivi des frais de déplacements, déployable sur **GitHub Pages** avec **Supabase** comme backend (authentification, base de données, stockage de fichiers).

---

## Fonctionnalités

- **Authentification** par email/mot de passe (inscription + connexion)
- **Calendrier mensuel** avec navigation mois par mois
- **Ajout de déplacements** par jour : lieu départ/arrivée, horaires, montant forfaitaire 20 €
- **Upload de justificatifs** (JPEG/PNG, glisser-déposer)
- **Récapitulatif mensuel** : nombre de déplacements et montant total remboursable
- **Isolation des données** : chaque utilisateur voit uniquement ses propres entrées (Row Level Security)
- **Responsive** : interface optimisée desktop et mobile (bottom sheet tactile)

---

## Architecture

```
GitHub Pages (frontend statique)
        │
        │ HTTPS
        ▼
Supabase (backend gratuit)
  ├── Auth        → Inscription / connexion JWT
  ├── PostgreSQL  → Table deplacements avec RLS
  └── Storage     → Bucket justificatifs
```

---

## Déploiement pas à pas

### Étape 1 — Créer un projet Supabase

1. Aller sur [supabase.com](https://supabase.com) et créer un compte gratuit.
2. Cliquer sur **"New project"**.
3. Remplir :
   - **Name** : `frais-pro` (ou autre)
   - **Database Password** : choisir un mot de passe fort (le noter)
   - **Region** : choisir la plus proche (ex. West EU - Ireland)
4. Attendre la création du projet (environ 1 minute).

---

### Étape 2 — Configurer la base de données

1. Dans le dashboard Supabase, aller dans **SQL Editor** (icône `</>` dans la barre latérale).
2. Cliquer sur **"New query"**.
3. Copier-coller le contenu du fichier `supabase-schema.sql` fourni dans ce dépôt.
4. Cliquer sur **"Run"** (ou `Ctrl+Enter`).
5. Vérifier qu'aucune erreur n'apparaît dans les résultats.

---

### Étape 3 — Créer le bucket de stockage

1. Dans Supabase, aller dans **Storage** (icône dossier dans la barre latérale).
2. Cliquer sur **"New bucket"**.
3. Renseigner :
   - **Name** : `justificatifs` (exactement ce nom, sensible à la casse)
   - **Public bucket** : activer ✅ (nécessaire pour afficher les images)
4. Cliquer sur **"Save"**.

> Les politiques de sécurité du bucket ont déjà été créées par le script SQL (étape 2).

---

### Étape 4 — Récupérer les clés d'API

1. Dans Supabase, aller dans **Settings > API** (icône engrenage).
2. Copier :
   - **Project URL** → c'est votre `SUPABASE_URL`
   - **anon / public key** → c'est votre `SUPABASE_ANON_KEY`

---

### Étape 5 — Configurer le frontend

Ouvrir le fichier `app.js` et remplacer les deux lignes suivantes en haut du fichier :

```js
const SUPABASE_URL = window.SUPABASE_URL || 'VOTRE_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'VOTRE_SUPABASE_ANON_KEY';
```

Par vos vraies valeurs, par exemple :

```js
const SUPABASE_URL = window.SUPABASE_URL || 'https://abcdefghij.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

> **Note de sécurité** : la clé `anon` est conçue pour être exposée côté client. Elle ne donne accès qu'aux données autorisées par les RLS policies. Ne jamais utiliser la clé `service_role` côté client.

---

### Étape 6 — Déployer sur GitHub Pages

#### Option A — Depuis l'interface GitHub (recommandé pour débuter)

1. Créer un nouveau dépôt sur [github.com](https://github.com) (ex. `frais-pro`).
2. Uploader les fichiers : `index.html`, `app.js`, `style.css`.
3. Aller dans **Settings > Pages**.
4. Dans **"Source"**, sélectionner **"Deploy from a branch"**.
5. Choisir la branche `main` et le dossier `/ (root)`.
6. Cliquer sur **"Save"**.
7. Après quelques secondes, l'URL de votre site apparaît (ex. `https://votre-pseudo.github.io/frais-pro/`).

#### Option B — Depuis Git en ligne de commande

```bash
# Cloner ou initialiser un dépôt
git init
git remote add origin https://github.com/VOTRE_PSEUDO/frais-pro.git

# Ajouter les fichiers
git add index.html app.js style.css
git commit -m "Initial deploy"
git push -u origin main

# Activer GitHub Pages depuis Settings > Pages (branche main, racine /)
```

---

### Étape 7 — Configurer les URLs autorisées dans Supabase

Pour que l'authentification fonctionne depuis votre domaine GitHub Pages :

1. Dans Supabase, aller dans **Authentication > URL Configuration**.
2. Dans **"Site URL"**, entrer : `https://votre-pseudo.github.io/frais-pro`
3. Dans **"Redirect URLs"**, ajouter : `https://votre-pseudo.github.io/frais-pro`
4. Sauvegarder.

---

## Structure des fichiers

```
frais-pro/
├── index.html          → Structure HTML de l'application
├── app.js              → Logique JavaScript (auth, CRUD, Supabase)
├── style.css           → Styles et design system
├── supabase-schema.sql → Schéma SQL à exécuter dans Supabase
├── .env.example        → Documentation des variables d'environnement
└── README.md           → Ce fichier
```

---

## Schéma de la table `deplacements`

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | Identifiant unique (généré automatiquement) |
| `user_id` | UUID | Référence à l'utilisateur (auth.users) |
| `date` | DATE | Date du déplacement |
| `lieu_depart` | TEXT | Lieu de départ |
| `lieu_arrivee` | TEXT | Lieu d'arrivée |
| `heure_depart` | TIME | Heure de départ (optionnel) |
| `heure_arrivee` | TIME | Heure d'arrivée (optionnel) |
| `montant` | NUMERIC | Montant forfaitaire (20 € par défaut) |
| `justificatif_url` | TEXT | URL publique de l'image (optionnel) |
| `created_at` | TIMESTAMPTZ | Date de création |
| `updated_at` | TIMESTAMPTZ | Date de dernière modification |

---

## Personnalisation

### Modifier le montant forfaitaire

Dans `app.js`, modifier la ligne :
```js
const FORFAIT_MONTANT = 20; // € par déplacement
```

### Activer la confirmation par email

Par défaut, Supabase envoie un email de confirmation à l'inscription. Pour le désactiver (pratique pour les tests) : Supabase > Authentication > Providers > Email > décocher "Confirm email".

---

## Limites du tier gratuit Supabase

| Ressource | Limite gratuite |
|---|---|
| Base de données | 500 Mo |
| Stockage fichiers | 1 Go |
| Bande passante | 5 Go/mois |
| Utilisateurs | Illimité |
| Requêtes API | Illimité |

Largement suffisant pour un usage personnel ou une équipe réduite.

---

## Dépannage

**L'authentification ne fonctionne pas après déploiement**
→ Vérifier l'étape 7 (URLs autorisées dans Supabase Authentication).

**Les images ne s'affichent pas**
→ Vérifier que le bucket `justificatifs` est bien en mode **Public**.

**"Failed to fetch" dans la console**
→ Vérifier que `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont correctement renseignés dans `app.js`.

**RLS error / permission denied**
→ Vérifier que le script SQL a bien été exécuté en totalité (étape 2).