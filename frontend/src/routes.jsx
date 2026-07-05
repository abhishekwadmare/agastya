import Icon from "@mui/material/Icon";

import Jobs from "layouts/jobs";
import Alerts from "layouts/alerts";
import Applications from "layouts/applications";

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
    name: "Alerts",
    key: "alerts",
    icon: <Icon fontSize="small">notifications_active</Icon>,
    route: "/alerts",
    component: <Alerts />,
  },
  {
    type: "collapse",
    name: "Applications",
    key: "applications",
    icon: <Icon fontSize="small">send</Icon>,
    route: "/applications",
    component: <Applications />,
  },
];

export default routes;
