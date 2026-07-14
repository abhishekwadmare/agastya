import Icon from "@mui/material/Icon";

import Jobs from "layouts/jobs";
import Companies from "layouts/companies";
import Alerts from "layouts/alerts";
import Admins from "layouts/admins";
import Applications from "layouts/applications";
import About from "layouts/about";

const routes = [
  {
    type: "collapse",
    name: "Jobs",
    key: "jobs",
    icon: <Icon fontSize="small">work</Icon>,
    route: "/jobs",
    component: <Jobs />,
  },
  {
    type: "collapse",
    name: "Companies",
    key: "companies",
    icon: <Icon fontSize="small">business</Icon>,
    route: "/companies",
    component: <Companies />,
  },
  {
    type: "collapse",
    name: "Alerts",
    key: "alerts",
    icon: <Icon fontSize="small">notifications_active</Icon>,
    route: "/alerts",
    component: <Alerts />,
  },
  {
    type: "collapse",
    name: "Admins",
    key: "admins",
    icon: <Icon fontSize="small">admin_panel_settings</Icon>,
    route: "/admins",
    component: <Admins />,
  },
  {
    type: "collapse",
    name: "Applications",
    key: "applications",
    icon: <Icon fontSize="small">send</Icon>,
    route: "/applications",
    component: <Applications />,
  },
  {
    type: "collapse",
    name: "About",
    key: "about",
    icon: <Icon fontSize="small">info</Icon>,
    route: "/about",
    component: <About />,
  },
];

export default routes;
