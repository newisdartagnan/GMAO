import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FournisseurGMAO } from '@/data/store';
import { Application } from '@/layouts/Application';
import { TableauDeBord } from '@/pages/TableauDeBord';
import { PageAlertes } from '@/pages/Alertes';
import { PageAnalyses } from '@/pages/Analyses';
import { PageDemandes } from '@/pages/Demandes';
import { PageOrdresTravail } from '@/pages/OrdresTravail';
import { PageOrdreTravailDetail } from '@/pages/OrdreTravailDetail';
import { PagePlanning } from '@/pages/Planning';
import { PagePreventif } from '@/pages/Preventif';
import { PageReglementaire } from '@/pages/Reglementaire';
import { PagePredictif } from '@/pages/Predictif';
import { PageEquipements } from '@/pages/Equipements';
import { PageEquipementDetail } from '@/pages/EquipementDetail';
import { PageImplantation } from '@/pages/Implantation';
import { PageVigilance } from '@/pages/Vigilance';
import { PageStocks } from '@/pages/Stocks';
import { PageAchats } from '@/pages/Achats';
import { PageContrats } from '@/pages/Contrats';
import { PageEquipes } from '@/pages/Equipes';
import { PageDocuments } from '@/pages/Documents';
import { PageAudit } from '@/pages/Audit';
import { PageParametres } from '@/pages/Parametres';
import { PageScan } from '@/pages/Scan';

export function App() {
  return (
    <FournisseurGMAO>
      <BrowserRouter>
        <Routes>
          <Route element={<Application />}>
            <Route index element={<TableauDeBord />} />
            <Route path="alertes" element={<PageAlertes />} />
            <Route path="analyses" element={<PageAnalyses />} />
            <Route path="demandes" element={<PageDemandes />} />
            <Route path="ordres-travail" element={<PageOrdresTravail />} />
            <Route path="ordres-travail/:id" element={<PageOrdreTravailDetail />} />
            <Route path="planning" element={<PagePlanning />} />
            <Route path="preventif" element={<PagePreventif />} />
            <Route path="reglementaire" element={<PageReglementaire />} />
            <Route path="predictif" element={<PagePredictif />} />
            <Route path="equipements" element={<PageEquipements />} />
            <Route path="equipements/:id" element={<PageEquipementDetail />} />
            <Route path="implantation" element={<PageImplantation />} />
            <Route path="vigilance" element={<PageVigilance />} />
            <Route path="stocks" element={<PageStocks />} />
            <Route path="achats" element={<PageAchats />} />
            <Route path="contrats" element={<PageContrats />} />
            <Route path="equipes" element={<PageEquipes />} />
            <Route path="documents" element={<PageDocuments />} />
            <Route path="audit" element={<PageAudit />} />
            <Route path="parametres" element={<PageParametres />} />
            <Route path="scan" element={<PageScan />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </FournisseurGMAO>
  );
}
