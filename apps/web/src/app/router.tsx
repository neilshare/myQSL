import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout } from "./AppLayout";
import { QsoListPage } from "../features/qsos/QsoListPage";
import { TrashPage } from "../features/qsos/TrashPage";
import { StationSettings } from "../features/stations/StationSettings";
import { ImportPage } from "../features/imports/ImportPage";
import { TemplateListPage } from "../features/templates/TemplateListPage";
import { TemplateEditorPage } from "../features/templates/TemplateEditorPage";
import { CardListPage } from "../features/cards/CardListPage";
import { CardCreatePage } from "../features/cards/CardCreatePage";
import { CardLookupPage } from "../features/public/CardLookupPage";
import { PublicCardPage } from "../features/public/PublicCardPage";
import { PrintPage } from "../features/printing/PrintPage";
import { DeliveryPage } from "../features/deliveries/DeliveryPage";
import { AgentSettingsPage } from "../features/integrations/AgentSettingsPage";

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Navigate to="/admin/qsos" replace /> },
      { path: "/admin/qsos", element: <QsoListPage /> },
      { path: "/admin/import", element: <ImportPage /> },
      { path: "/admin/trash", element: <TrashPage /> },
      { path: "/admin/settings/stations", element: <StationSettings /> },
      { path: "/admin/templates", element: <TemplateListPage /> },
      { path: "/admin/templates/edit", element: <TemplateEditorPage /> },
      { path: "/templates/edit", element: <TemplateEditorPage /> },
      { path: "/admin/cards", element: <CardListPage /> },
      { path: "/admin/cards/new", element: <CardCreatePage /> },
      { path: "/admin/print", element: <PrintPage /> },
      { path: "/admin/deliveries", element: <DeliveryPage /> },
      { path: "/admin/settings/integrations", element: <AgentSettingsPage /> },
      { path: "/cards/create", element: <CardCreatePage /> },
      { path: "/lookup", element: <CardLookupPage /> },
      { path: "/c/:publicId", element: <PublicCardPage /> }
    ]
  }
]);
