import { createBrowserRouter, Navigate } from "react-router";
import { QsoListPage } from "../features/qsos/QsoListPage";
import { TrashPage } from "../features/qsos/TrashPage";
import { StationSettings } from "../features/stations/StationSettings";
import { ImportPage } from "../features/imports/ImportPage";
import { TemplateListPage } from "../features/templates/TemplateListPage";
import { CardListPage } from "../features/cards/CardListPage";
import { CardCreatePage } from "../features/cards/CardCreatePage";
import { CardLookupPage } from "../features/public/CardLookupPage";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/admin/qsos" replace /> },
  { path: "/admin/qsos", element: <QsoListPage /> },
  { path: "/admin/import", element: <ImportPage /> },
  { path: "/admin/trash", element: <TrashPage /> },
  { path: "/admin/settings/stations", element: <StationSettings /> }
  ,{ path: "/admin/templates", element: <TemplateListPage /> },
  { path: "/admin/cards", element: <CardListPage /> },
  { path: "/admin/cards/new", element: <CardCreatePage /> },
  { path: "/lookup", element: <CardLookupPage /> }
]);
