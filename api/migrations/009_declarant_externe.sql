-- =====================================================================
--  Le nom écrit sur le formulaire, remis là où on peut le lire
--
--  Les demandes venues du formulaire sont portées par un compte de
--  service : « Eugénie » n'a pas de compte dans la GMAO. Jusqu'ici son
--  nom n'existait que noyé dans la description, et la liste affichait le
--  compte de service pour tout le monde — trois signalements de trois
--  personnes se ressemblaient comme trois gouttes d'eau.
--
--  Le nom est désormais rangé dans « origine_externe.declarant » à
--  l'import. Cette migration fait de même pour ce qui est déjà en base :
--  sans elle, les demandes reçues avant la correction continueraient
--  d'afficher le compte de service, et rien ne dirait pourquoi.
--
--  La source est la ligne « Déclaré par : » de la description. Elle est
--  écrite exactement quand le déclarant n'a PAS été retrouvé dans
--  l'annuaire — c'est-à-dire précisément dans les cas à réparer. Une
--  demande dont le déclarant est un utilisateur connu n'en porte pas, et
--  reste telle quelle.
-- =====================================================================

UPDATE demandes
   SET origine_externe = jsonb_set(
         origine_externe,
         '{declarant}',
         to_jsonb(trim(substring(description from 'Déclaré par : ([^\n]+)')))
       )
 WHERE origine_externe IS NOT NULL
   AND origine_externe ->> 'declarant' IS NULL
   AND description ~ 'Déclaré par : [^\n]';
