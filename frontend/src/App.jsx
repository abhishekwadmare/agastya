import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

import Sidenav from "examples/Sidenav";
import theme from "assets/theme";
import routes from "routes";

import { MaterialUIControllerProvider, useMaterialUIController, setMiniSidenav } from "context";
import { AuthProvider } from "context/AuthContext.jsx";
import { DataProvider } from "context/DataContext.jsx";

function Layout() {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav, sidenavColor } = controller;
  const [onMouseEnter, setOnMouseEnter] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
  }, [pathname]);

  function handleOnMouseEnter() {
    if (miniSidenav && !onMouseEnter) {
      setMiniSidenav(dispatch, false);
      setOnMouseEnter(true);
    }
  }

  function handleOnMouseLeave() {
    if (onMouseEnter) {
      setMiniSidenav(dispatch, true);
      setOnMouseEnter(false);
    }
  }

  return (
    <>
      <Sidenav
        color={sidenavColor}
        brandName="Agastya"
        routes={routes}
        onMouseEnter={handleOnMouseEnter}
        onMouseLeave={handleOnMouseLeave}
      />
      <Routes>
        {routes.map((route) => (
          <Route exact path={route.route} element={route.component} key={route.key} />
        ))}
        <Route path="*" element={<Navigate to="/jobs" />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <MaterialUIControllerProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <DataProvider>
            <Layout />
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </MaterialUIControllerProvider>
  );
}
