# ManageAsmat

Site web pour gérer la paie d'une **assistante maternelle agréée** employée par un particulier, et obtenir chaque
mois **les valeurs à saisir sur Pajemploi**.

1. **Enfants** : déclarer le ou les enfants accueillis.
2. **Contrats** : année complète / incomplète, planning type de la semaine, taux horaire, repas et goûters,
   indemnité d'entretien, indemnités kilométriques, majorations, mode de paiement des congés payés.
3. **Calendrier prévisionnel** : le planning est appliqué automatiquement (jours fériés compris). On **clique sur
   un jour** pour saisir sa journée : statut (absence, congés…), **heure d'arrivée et de départ**, km, repas. Le
   bouton « ✓ Conforme au planning » valide une journée normale en un clic. Une journée saisie passe en **bleu avec
   ✓**. La vue « Saisie jour par jour » affiche tout le mois en tableau, et les événements sur plusieurs jours
   (vacances, semaines sans accueil) se saisissent avec « Événement sur plusieurs jours… ». Un **compteur de congés
   payés** de l'assistante maternelle (acquis, pris, restants, en cours d'acquisition) est affiché sous le calendrier.
   En année incomplète, un second compteur suit le **forfait de semaines sans accueil** (vacances de l'enfant,
   jours perlés) : forfait, pris, posés, restant, avec alerte en cas de dépassement.
4. **Pajemploi** : rubriques à recopier (avec bouton « Copier »), détail du calcul et récapitulatif annuel.

Les données restent **dans le navigateur** (localStorage). L'onglet « Sauvegarde & aide » permet d'exporter et
d'importer un fichier JSON.

## Lancer le projet

```bash
npm install
npm run dev      # serveur de développement
npm test         # tests du moteur de calcul
npm run build    # site statique dans dist/ (hébergeable sur GitHub Pages, Netlify…)
```

### Docker

```bash
docker build -t manageasmat .
docker run -d -p 8080:8080 manageasmat      # puis http://localhost:8080
```

L'image construit le site (tests compris), puis le sert avec nginx (utilisateur non root, port 8080).

À chaque commit poussé, la GitHub Action [`.github/workflows/docker.yml`](.github/workflows/docker.yml) lance les
tests, construit l'image (amd64 et arm64) et la publie sur GitHub Container Registry :

```bash
docker run -d -p 8080:8080 ghcr.io/ekozan/manageasmat:latest        # branche par défaut
docker run -d -p 8080:8080 ghcr.io/ekozan/manageasmat:<branche>     # ou sha-<commit>
```

Tags publiés : `sha-<commit>`, nom de la branche, `latest` (branche par défaut) et `x.y.z` pour un tag `vx.y.z`.
Pour une pull request, l'image est seulement construite, pas publiée. Les données restant dans le navigateur, le
conteneur ne stocke rien.

### Publier une version

```bash
git tag v1.2.3 && git push origin v1.2.3
```

Le workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) se déclenche sur chaque tag de
version (`v1.2.3` ou `1.2.3`, préversions `v1.2.3-rc.1` acceptées) :

1. tests et vérification du chart ;
2. image `ghcr.io/ekozan/manageasmat` publiée avec les tags `1.2.3`, `1.2`, `1` et `latest` (pas de `latest` pour
   une préversion) ;
3. chart empaqueté depuis le code du tag en version `1.2.3` (appVersion `1.2.3`, donc l'image `1.2.3`) et publié
   sur `oci://ghcr.io/ekozan/charts/manageasmat` ;
4. `Chart.yaml` mis à jour (`version` et `appVersion`) et commité sur la branche par défaut ;
5. release GitHub créée avec les notes générées et le chart `.tgz` en pièce jointe.

Sans passer par git : GitHub → Actions → **Release** → **Run workflow**, saisir la version (ex. `1.2.3`) ; le tag
`v1.2.3` est créé sur le commit choisi.

Si la branche par défaut est protégée, autorisez `github-actions[bot]` à y pousser, sinon l'étape 4 échoue.

### Kubernetes (Helm)

Le chart est dans [`charts/manageasmat`](charts/manageasmat) et publié à chaque commit sur ghcr.io (OCI) :

```bash
# Dernière version d'une branche : voir les versions dans GitHub → Packages → charts/manageasmat
helm install manageasmat oci://ghcr.io/ekozan/charts/manageasmat --version 0.1.0-g<commit>

# Depuis le dépôt, avec un Ingress :
helm install manageasmat charts/manageasmat \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set 'ingress.hosts[0].host=paie.mondomaine.fr' --set 'ingress.hosts[0].paths[0].path=/' \
  --set 'ingress.hosts[0].paths[0].pathType=Prefix'
```

- Versions publiées : `0.1.0-g<commit>` pour chaque commit (pointe sur l'image `sha-<commit>`), et `x.y.z` pour
  chaque release (voir ci-dessous).
- Options principales de `values.yaml` : `replicaCount`, `image.tag`, `ingress.*`, `resources`, `autoscaling`,
  `podDisruptionBudget`, `imagePullSecrets` (si l'image reste privée).
- Pod sécurisé par défaut : utilisateur non root, système de fichiers en lecture seule, aucune capacité Linux.
- Aucun volume persistant : les données restent dans le navigateur de chaque utilisateur.
- `helm test manageasmat` vérifie que le service répond.

Le code de calcul est dans [`src/lib/paie.ts`](src/lib/paie.ts) et ses tests, qui reprennent les exemples
ci-dessous, dans [`src/lib/paie.test.ts`](src/lib/paie.test.ts).

> ⚠️ **Outil d'aide au calcul, sans valeur juridique.** Les règles ci-dessous ont été vérifiées en octobre 2026
> à partir des fiches DREETS, Pajemploi et du texte de la convention publié par les organisations signataires
> (voir [Sources](#sources)). Le texte de référence reste la **convention collective nationale des particuliers
> employeurs et de l'emploi à domicile (IDCC 3239)**, socle spécifique « assistant maternel », sur Légifrance.
> En cas de doute : relais petite enfance (RPE), DREETS ou simulateur Pajemploi.

---

## Sommaire des règles

| Sujet | Règle appliquée | Référence | Vérification |
|---|---|---|---|
| Type de contrat | 52 semaines (CP inclus) ou 46 semaines ou moins (hors CP) | CCN, socle AM | ✅ conforme |
| Mensualisation | taux × h/semaine × 52 ou semaines programmées ÷ 12 | CCN, socle AM | ✅ conforme |
| Absences déduites | en **heures** (52 sem.) / en **jours** (≤ 46 sem.), dénominateur incluant non-accueil et fériés | art. 111 | ✅ conforme |
| Mois d'entrée / de sortie | même formule que les absences | art. 111 | ✅ conforme |
| Maladie de l'enfant | non payée sur certificat, 5 jours / 12 mois, 14 jours calendaires consécutifs max | art. 105 | ⚠️ alerte seulement |
| Heures complémentaires | jusqu'à 45 h/semaine, taux normal sauf clause | CCN | ✅ conforme |
| Heures majorées | au-delà de 45 h/semaine, majoration ≥ 10 % fixée au contrat | CCN | ✅ conforme |
| Jours fériés chômés | payés (pas de déduction) si veille et lendemain travaillés | art. 47.2 | ✅ conforme (cas d'exclusion à saisir) |
| Jour férié travaillé | majoration ≥ 10 %, 1er mai payé double | art. 47 | ✅ conforme |
| Acquisition des CP | 2,5 j ouvrables / 4 semaines de travail effectif, 30 j max, arrondi supérieur | Code du travail L3141-3, L3141-7 | ✅ conforme |
| Indemnité de CP | max(maintien de salaire, 10 % du brut de la période) | L3141-24, art. 102 | ✅ principe conforme, maintien approximé |
| Paiement des CP (≤ 46 sem.) | juin, prise principale ou au fur et à mesure ; **jamais 10 % par mois** | art. 102 | ✅ conforme |
| Indemnité d'entretien | ≥ 90 % du minimum garanti pour 9 h, ≥ 2,65 €/jour | CCN | ✅ conforme (montant à saisir) |
| Pajemploi | heures arrondies à l'entier le plus proche, CP convertis en heures | guides Pajemploi / RPE | ✅ conforme aux guides |
| Jours d'activité Pajemploi | forfait jours/semaine × semaines ÷ 12 arrondi au supérieur, − absences déduites + jours en plus | fiches CAF / RPE | ✅ conforme aux guides |

---

## 1. Type de contrat et mensualisation

La convention prévoit deux modes d'accueil régulier, toujours **mensualisés** : le salaire est le même chaque
mois, quel que soit le nombre de jours du mois.

| | Année complète | Année incomplète |
|---|---|---|
| Accueil | 52 semaines sur 12 mois, **dont** les 5 semaines de congés payés | **46 semaines ou moins** sur 12 mois, **hors** congés payés |
| Salaire mensualisé | taux × heures/semaine × **52** ÷ 12 | taux × heures/semaine × **semaines programmées** ÷ 12 |
| Congés payés | inclus dans le salaire mensualisé | payés **en plus** (voir § 6) |

Le seuil est **46 semaines** : un contrat de 41, 40 ou 36 semaines (accueil périscolaire, parents
enseignants…) est en année incomplète et se calcule exactement de la même manière, avec son propre nombre de
semaines. L'application signale un contrat « incomplet » déclaré à plus de 46 semaines.

Si la semaine type dépasse 45 heures, les heures au-delà sont mensualisées avec leur majoration :
salaire = taux × (heures normales + heures au-delà de 45 h × (1 + majoration)) × semaines ÷ 12.

**Exemples** (taux 5 € brut, 4 jours × 9 h = 36 h par semaine) :

- année complète : 5 × 36 × 52 ÷ 12 = **780 € brut** (156 h mensualisées) ;
- année incomplète 41 semaines : 5 × 36 × 41 ÷ 12 = **615 € brut** (123 h) ;
- année incomplète 36 semaines : 5 × 36 × 36 ÷ 12 = **540 € brut** (108 h).

En année incomplète, les semaines sans accueil doivent être indiquées au contrat (ou communiquées au moins
2 mois à l'avance). Dans l'application, on les saisit dans le calendrier avec l'événement **« Période non
programmée »**. Elles ne sont pas déduites : la mensualisation les a déjà prises en compte.

## 2. Absences et mois incomplets (article 111)

Seules certaines absences permettent de réduire le salaire mensualisé (voir le tableau du § 3). La déduction suit
la formule de l'article 111, dite « méthode Cour de cassation » :

**Année complète (52 semaines) : calcul en heures**

```
déduction = salaire mensualisé × heures d'absence ÷ heures qui auraient été travaillées dans le mois
```

**Année incomplète (46 semaines ou moins) : calcul en jours**

```
déduction = salaire mensualisé × jours d'absence ÷ jours qui auraient été travaillés dans le mois
```

Dans les deux cas, le **dénominateur** compte tout ce que prévoit le planning type sur le mois, **y compris** les
jours d'absence, les **semaines de non-accueil** et les **jours fériés chômés** qui tombent un jour
habituellement travaillé. L'application le calcule à partir du planning et du calendrier.

Une absence d'une partie de la journée seulement (champ « heures d'absence ») est comptée en heures en année
complète et en fraction de journée en année incomplète (3 h sur une journée de 9 h = 1/3 de jour).

**Mois d'entrée et de sortie.** On applique la même formule : les jours du mois situés avant le début ou après la
fin du contrat sont comptés comme non travaillés. On ne fait pas de prorata en jours calendaires.

**Exemples** (septembre 2026 : 17 jours prévus × 9 h = 153 h) :

- année complète, enfant malade 2 jours : 780 × 18 ÷ 153 = 91,76 € déduits ;
- année incomplète 40 semaines (600 €), 2 jours d'absence : 600 × 2 ÷ 17 = 70,59 € déduits ;
- même contrat avec une semaine sans accueil le 21 septembre et 1 jour d'absence : le dénominateur reste à 17,
  soit 600 × 1 ÷ 17 = 35,29 € déduits ;
- contrat commençant le 14 septembre (année complète) : 7 jours prévus avant le début, soit 63 h,
  d'où un salaire de 780 × (1 − 63 ÷ 153) = 458,82 €.

Un mois entier sans accueil (par exemple août en année incomplète) est **payé normalement** : c'est le principe de
la mensualisation.

**Forfait de semaines sans accueil (année incomplète).** Un contrat de N semaines programmées laisse
**52 − N semaines sans accueil** sur 12 mois. Elles comprennent les vacances de l'enfant, les jours perlés et
les congés de l'assistante maternelle pris pendant ces périodes. Par exemple, 41 semaines laissent 11 semaines
sans accueil. On les pose dans le calendrier avec « Vacances de l'enfant / jour perlé » (ou « Congés payés »
pour ceux de l'assistante maternelle). Le compteur les décompte en **jours d'accueil du planning** : avec
4 jours d'accueil par semaine, une semaine de vacances = 4 j, un jour perlé = 1 j, un forfait de 11 semaines =
44 j. Il est calculé sur l'année de contrat (12 mois à partir de la date de début ou de sa date anniversaire)
et distingue les jours **déjà pris** des jours **posés à venir**. Au-delà du forfait, les jours où l'enfant ne
vient pas ne sont plus « non programmés » : ils doivent être payés (« Absence enfant payée ») ou le contrat
révisé par avenant.

En année complète, il n'y a pas de forfait : une absence de l'enfant hors des congés de l'assistante
maternelle est payée (« Absence enfant payée »).

## 3. Les événements du calendrier

| Événement | Salaire | Entretien / repas | Règle |
|---|---|---|---|
| Absence de l'enfant **déduite** | déduite (art. 111) | non dus | maladie avec certificat médical, voir ci-dessous |
| Absence de l'enfant **payée** | maintenu | non dus | absence pour convenance des parents : le salaire est dû |
| Absence de l'assistante maternelle | déduite (art. 111) | non dus | maladie (indemnités journalières CPAM), congé sans solde… |
| Congés payés | maintenu (complète) / payés à part (incomplète) | non dus | voir § 6 |
| Période non programmée | maintenu (mensualisé) | non dus | année incomplète uniquement |
| Heures réelles (arrivée / départ) | maintenu si moins que prévu ; au-delà, heures en plus | entretien sur les heures réelles | voir ci-dessous |
| Heures en plus | + heures complémentaires ou majorées | dus si accueil | voir § 4 |
| Jour férié travaillé | + majoration | dus | voir § 5 |
| Frais | — | km, repas en plus/en moins | voir § 7 |

**Heures réelles.** Le salaire étant mensualisé, un enfant arrivé plus tard ou reparti plus tôt que prévu à
l'initiative des parents **ne donne lieu à aucune déduction** : seules les absences prévues par la convention
(maladie de l'enfant justifiée, absence de l'assistante maternelle…) se déduisent. Les heures au-delà du planning
deviennent des heures complémentaires, puis majorées au-delà de 45 h dans la semaine. L'indemnité d'entretien
horaire suit les heures réellement faites. Saisir des heures réelles un jour férié le compte comme férié
travaillé, donc majoré.

**Maladie de l'enfant (article 105).** Les parents peuvent ne pas rémunérer l'absence de l'enfant malade si
elle est justifiée par un certificat médical (à fournir rapidement, en pratique sous 48 h). Ces absences sont
limitées à **5 jours** (consécutifs ou non) par période de **12 mois glissants** à partir de la date d'effet du
contrat. Au-delà de **14 jours calendaires consécutifs** d'absence, l'employeur doit reprendre le paiement du
salaire ou rompre le contrat. La façon dont ces deux limites se combinent est interprétée différemment selon les
sources : l'application **n'empêche pas** la saisie mais **affiche une alerte** dès que l'année de contrat compte
plus de 5 jours déduits ou une absence de plus de 14 jours.

## 4. Heures complémentaires et majorées

Les heures sont comptées **par semaine civile** (lundi → dimanche), sur le total de la semaine. Les heures
majorées sont imputées sur les dernières heures en plus de la semaine :

- **heures complémentaires** : au-delà de l'horaire du contrat **jusqu'à 45 h** dans la semaine. Payées au taux
  normal, sauf si le contrat prévoit une majoration (champ « majoration des heures complémentaires ») ;
- **heures majorées** : au-delà de **45 h** dans la semaine. Majoration fixée au contrat, **10 % minimum**.

Exemple : semaine de 36 h prévues, 12 h en plus le vendredi, soit 48 h. On compte 9 h complémentaires
(36 → 45 h) et 3 h majorées. Avec un taux de 5 € et une majoration de 25 % : 9 × 5 + 3 × 5 × 1,25 = 63,75 € brut.

## 5. Jours fériés

Les jours fériés sont calculés automatiquement (France métropolitaine) : 1er janvier, lundi de Pâques, 1er mai,
8 mai, Ascension, lundi de Pentecôte, 14 juillet, 15 août, 1er novembre, 11 novembre, 25 décembre.

- **Férié chômé** tombant un jour d'accueil : **pas de déduction**, pas d'indemnité d'entretien ni de repas. Le
  maintien du salaire suppose que l'assistante maternelle ait travaillé le dernier jour d'accueil avant le férié
  et le premier jour après, sauf absence autorisée (art. 47.2). Si cette condition n'est pas remplie, saisir une
  « absence de l'assistante maternelle » sur le jour férié : il sera déduit.
- **Férié travaillé** (événement « Jour férié travaillé ») : il doit être prévu au contrat ou accepté par écrit.
  Il est **majoré d'au moins 10 %** (champ du contrat). Le **1er mai** travaillé est **payé double** (+100 %).
- Un férié qui tombe un jour non travaillé ou pendant une semaine sans accueil n'a aucun effet.
- Le lundi de Pentecôte peut être la journée de solidarité. Si l'accueil a lieu ce jour-là, saisir « Jour férié
  travaillé » en ajustant la majoration si besoin.

Exemple : en mai 2026, 1er mai (vendredi) et Ascension (jeudi 14) travaillés, 9 h chacun à 5 € :
9 × 5 × 100 % + 9 × 5 × 10 % = **49,50 €** de majoration.

## 6. Congés payés

### Acquisition

- Période de référence : **1er juin → 31 mai** (ou date d'embauche → 31 mai).
- **2,5 jours ouvrables** par période de 4 semaines de travail effectif, **30 jours** (5 semaines) au maximum,
  arrondis au nombre entier supérieur.
- Sont comptés comme travail effectif : les jours d'accueil, les absences de l'enfant, les jours fériés et les
  congés payés. Les semaines non programmées et les absences de l'assistante maternelle ne le sont pas.

Exemples : 41 semaines → 41 ÷ 4 × 2,5 = 25,6 → **26 jours** ; 40 semaines → 25 jours ; année complète entière
→ 30 jours ; contrat démarré le 1er septembre → 39 semaines → 24,4 → 25 jours pour la première période.

### Compteur

Sous le calendrier, le compteur affiche à la date du jour (ou à la fin du mois consulté) :

- les jours **acquis** sur la dernière période close (1er juin → 31 mai), à prendre du 1er juin suivant au 31 mai ;
- les jours **pris** depuis le 1er juin et les jours **posés** sur toute la période (congés prévus compris) ;
- les jours **restants** à poser. S'ils sont négatifs, les jours en trop sont un congé sans solde ;
- les jours **en cours d'acquisition** sur la période actuelle, et l'estimation au 31 mai.

Les jours sont des jours **ouvrables** (lundi → samedi, hors fériés) : une semaine de congés compte 6 jours.

### Montant de l'indemnité

On calcule les deux méthodes et on retient **la plus favorable** à l'assistante maternelle :

- **règle du dixième** : 10 % de la rémunération brute de la période de référence (hors indemnités d'entretien,
  repas et km). Comme le prévoit le Code du travail, l'indemnité de congés payés versée pendant la période
  entre dans cette base ;
- **maintien de salaire** : ce qu'elle aurait gagné en travaillant pendant ses congés. L'application l'estime à
  « une semaine de salaire pour 6 jours ouvrables », soit jours acquis ÷ 6 × salaire d'une semaine type.

### Année complète (52 semaines)

Les congés sont **payés par la mensualisation** : aucune déduction quand l'assistante maternelle est en congé.
Au 31 mai, si la règle du dixième donne plus que le maintien, la **différence est versée en juin**. C'est le cas
le plus fréquent pour une période complète : 10 % de 52 semaines de salaire représente 5,2 semaines, contre
5 semaines de congés.

Exemple : 780 €/mois du 1er juin 2025 au 31 mai 2026, 30 jours acquis. Le dixième vaut 936 € et le maintien
900 € (5 × 180 €). On verse donc **36 € de complément en juin 2026**.

Si l'assistante maternelle prend plus de congés qu'elle n'en a acquis (première année par exemple), les jours en
trop sont un congé sans solde : saisissez-les comme « absence de l'assistante maternelle ».

### Année incomplète (46 semaines ou moins)

Les congés **ne sont pas inclus** dans le salaire mensualisé. L'indemnité est calculée au 31 mai, puis versée,
selon ce que prévoit le contrat, **en une seule fois en juin**, **lors de la prise principale des congés** (le mois
qui compte le plus de jours de congés) ou **au fur et à mesure de la prise des congés** (au prorata des jours
pris).

> ❌ **Le paiement « 10 % chaque mois » avec le salaire (dit « au douzième ») n'est plus autorisé depuis la
> convention de 2022.** L'application ne le propose pas.

Les congés de l'assistante maternelle sont pris pendant les semaines sans accueil : saisissez « Congés payés » sur
ces jours. Ils comptent ainsi dans les jours de congés déclarés à Pajemploi et, en mode « au fur et à mesure »,
déclenchent le paiement.

Exemple : 41 semaines à 615 €/mois du 1er juin 2025 au 31 mai 2026, soit 26 jours acquis. Le dixième vaut 738 €
et le maintien 26 ÷ 6 × 180 = 780 €. On retient **780 €**, versés :

- en juin 2026 (mode juin) : salaire de juin = 615 + 780 = 1 395 € brut ;
- ou en juillet 2026 (prise principale de 17 jours en juillet) ;
- ou au fur et à mesure : 780 × 17 ÷ 26 en juillet, puis 780 × 5 ÷ 26 en décembre, etc.

La première année, aucune indemnité n'est due avant le 1er juin suivant l'embauche : les congés pris avant sont
sans solde.

## 7. Indemnités et frais (non soumis à cotisations)

- **Entretien** : dû pour chaque jour où l'enfant est accueilli. Au minimum **90 % du minimum garanti (MG) pour
  9 h** d'accueil, proratisé selon la durée, et **jamais moins de 2,65 € par jour**. Au 1er juin 2026, le MG est de
  4,35 €, soit 3,92 € pour 9 h ou 0,435 € par heure. Le contrat peut fixer un montant par heure ou un forfait par
  jour ; l'application applique le plancher journalier.
- **Repas / goûters** : montants libres fixés au contrat, dus seulement si l'assistante maternelle les fournit.
  Le planning type indique les repas de chaque jour. Pour un repas en plus ou en moins un jour donné, utiliser
  l'événement « Frais ».
- **Kilomètres** : pour les déplacements faits avec l'enfant à la demande des parents. Taux fixé au contrat,
  sans dépasser le barème fiscal.

## 8. Du brut au net

Pajemploi demande le **salaire net**. L'application calcule en brut puis applique le **coefficient net/brut** du
contrat, 0,7812 par défaut (environ 21,9 % de cotisations salariales, valeur relevée pour 2026). Ce coefficient
change avec les taux de cotisations ; en Alsace-Moselle, il est plus faible. Vérifiez-le avec le simulateur
Pajemploi.

Minimum de rémunération : **4,20 € brut de l'heure par enfant** depuis le 1er juin 2026 (avenant n° 10 à
l'annexe 5 de la convention), 4,37 € pour les titulaires du titre de branche. À vérifier au moment de la
signature du contrat.

## 9. Ce qu'on saisit sur Pajemploi

| Rubrique | Calcul de l'application |
|---|---|
| Nombre d'heures normales | heures mensualisées × part du salaire due (après déductions) + heures complémentaires + congés payés versés à part convertis en heures (montant ÷ taux horaire), **arrondi à l'entier le plus proche** |
| Nombre de jours d'activité | **forfait mensualisé** : jours d'accueil par semaine × semaines (52 ou programmées) ÷ 12, **arrondi à l'entier supérieur**, − jours entiers d'absence déduite (et jours hors contrat du mois d'entrée/sortie) + jours d'accueil en dehors du planning. Ex. : 4 j × 52 ÷ 12 = 17,3 → 18 j chaque mois ; 4 j × 41 ÷ 12 = 13,7 → 14 j |
| Nombre de jours de congés payés | jours ouvrables (lundi → samedi, hors fériés) de congés pris dans le mois |
| Salaire net total | salaire brut total × coefficient net/brut |
| Heures majorées (nombre / montant net) | heures au-delà de 45 h par semaine, mensualisées et en plus |
| Indemnités d'entretien / de repas / kilométriques | totaux du mois |

Comme les heures, les jours d'activité sont **forfaitisés** pour un accueil mensualisé : on ne déclare pas les
jours réellement faits (sauf en accueil occasionnel). Un mois de vacances sans accueil en année incomplète se
déclare donc avec le forfait complet. Le nombre de jours de présence réelle reste affiché pour information.

La déclaration se fait entre le 25 du mois et le 5 du mois suivant. L'onglet Pajemploi affiche aussi le
**total à verser** (salaire net + indemnités) et le détail ligne par ligne.

## 10. Limites connues

Les points suivants ne sont pas calculés automatiquement. Il faut les traiter à part :

- **régularisation de fin de contrat** en année incomplète (comparaison des heures réellement faites et des heures
  payées) ;
- **indemnité de rupture**, indemnité compensatrice de congés payés à la fin du contrat, préavis ;
- **congés acquis pendant un arrêt maladie** de l'assistante maternelle (2 jours par mois depuis la loi du
  22 avril 2024) et **jours de fractionnement** ;
- maintien de salaire « exact » au jour près (l'application utilise une semaine type) ;
- **accueil occasionnel** (non mensualisé) ;
- spécificités **Alsace-Moselle** (jours fériés supplémentaires, cotisations) ;
- les montants légaux (MG, minimum horaire, coefficient net) sont des **valeurs par défaut à mettre à jour** dans
  chaque contrat.

## Sources

Consultées en octobre 2026. Ce sont des fiches officielles (DREETS) ou des reprises du texte conventionnel ; le
texte faisant foi est celui publié sur Légifrance.

- CGT – texte de la convention IDCC 3239 :
  [article 111 – déduction des périodes d'absence](https://convention-collective-idcc3239.cgt.fr/socle-assistant-maternel/article-111-deduction-des-periodes-dabsence/),
  [article 105 – absences de l'enfant](https://convention-collective-idcc3239.cgt.fr/socle-assistant-maternel/article-105-absences-de-lenfant/)
- DREETS Occitanie :
  [fiche accueil sur 46 semaines ou moins](https://occitanie.dreets.gouv.fr/sites/occitanie.dreets.gouv.fr/IMG/pdf/2023-01-19-fiche-accueil-en-annee-incomplete-version-definitive.pdf),
  [fiche accueil sur 52 semaines](https://occitanie.dreets.gouv.fr/sites/occitanie.dreets.gouv.fr/IMG/pdf/2023-01-19-fiche-accueil-en-annee-complete-version-definitive-2.pdf),
  [fiche sources juridiques (heures majorées)](https://occitanie.dreets.gouv.fr/sites/occitanie.dreets.gouv.fr/IMG/pdf/2024-11-05-fiche-sources-juridiques.pdf),
  [fiche mensualisation](https://occitanie.dreets.gouv.fr/sites/occitanie.dreets.gouv.fr/IMG/pdf/2024-11-05-fiche-mensualisation.pdf)
- DREETS Auvergne-Rhône-Alpes :
  [congés et absences (2024)](https://auvergne-rhone-alpes.dreets.gouv.fr/sites/auvergne-rhone-alpes.dreets.gouv.fr/IMG/pdf/assistants_maternels-conges_et_absences-ara-25-03-2024.pdf),
  [jours fériés](https://auvergne-rhone-alpes.dreets.gouv.fr/sites/auvergne-rhone-alpes.dreets.gouv.fr/IMG/pdf/assistants_maternels-jours_feries-ara-22-03-23-3.pdf),
  [fiche année incomplète](https://auvergne-rhone-alpes.dreets.gouv.fr/sites/auvergne-rhone-alpes.dreets.gouv.fr/IMG/pdf/fiche_annee_incomplete.pdf)
- DREETS Bourgogne-Franche-Comté : [fiche jours fériés](https://bourgogne-franche-comte.dreets.gouv.fr/sites/bourgogne-franche-comte.dreets.gouv.fr/IMG/pdf/fiche_4_jours_feries.pdf)
- DREETS Pays de la Loire : [rémunération, indemnités et frais au 1er juin 2026](https://pays-de-la-loire.dreets.gouv.fr/sites/pays-de-la-loire.dreets.gouv.fr/IMG/pdf/fiche_remu_indemnites_frais_au_12062026.pdf)
- Mai 2022, modes de paiement des congés payés : [fiche DREETS](https://www.paysdesherbiers.fr/medias/2022/07/FICHE-DREETS-complete-MAJ-mai-2022.pdf),
  [UNSA Pro-Assmat, nouvelle convention](https://www.unsaproassmat.org/IMG/pdf/pages_de_lettre_n16_version_27-08.pdf)
- Minimum horaire au 1er juin 2026 : [devenirassmat.com](https://devenirassmat.com/actualites/assistantes-maternelles-augmentation-des-salaires-au-1er-juin-2026),
  [France Emploi Domicile](https://www.franceemploidomicile.fr/actualite/hausse-des-salaires-minimums-au-1er-juin-2026-ce-quil-faut-savoir/)
- Jours d'activité mensualisés : [fiche CAF / réseau RPE](https://www.caf.fr/sites/default/files/medias/431/Partenaires/Petite%20enfance/Reseau%20RPE/avenant%20mai%202021.pdf),
  [fiche RPE « comment calculer la rémunération »](https://www.lachapellesurerdre.fr/sites/default/files/comment_calculer_la_remuneration_ass_mat.pdf)
- Déclaration Pajemploi : [guide Pajemploi 2026 (Salerya)](https://salerya.fr/statuts/assistante-maternelle/pajemploi/),
  [fiche RPE déclaration Pajemploi](https://www.lachapellesurerdre.fr/sites/default/files/declaration_pajemploi.pdf)
