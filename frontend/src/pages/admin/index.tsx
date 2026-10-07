import {
  Center,
  Col,
  createStyles,
  Grid,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TbCloudDownload, TbFolder, TbInbox, TbLink, TbPalette, TbRefresh, TbSend, TbSettings, TbShare, TbUsers } from "react-icons/tb"; // StundTransfer: TbInbox, TbFolder, TbSend, TbPalette, TbShare, TbCloudDownload
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import useTranslate from "../../hooks/useTranslate.hook";
import configService from "../../services/config.service";
// StundTransfer
import useConfig from "../../hooks/config.hook";
import { isClassicSharingEnabled } from "../../stundtransfer/classicSharing";
import stundTransferService from "../../stundtransfer/stundtransfer.service";

const useStyles = createStyles((theme) => ({
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    height: 90,
    "&:hover": {
      boxShadow: `${theme.shadows.sm} !important`,
      transform: "scale(1.01)",
    },
  },
}));

const Admin = () => {
  const { classes, theme } = useStyles();
  const t = useTranslate();
  const config = useConfig(); // StundTransfer

  const [managementOptions, setManagementOptions] = useState([
    // StundTransfer: all received deposits
    {
      title: t("stundtransfer.admin.card"),
      icon: TbInbox,
      route: "/account/deposits",
    },
    {
      title: t("stundtransfer.destination.title"),
      icon: TbFolder,
      route: "/admin/destination",
    },
    {
      // StundTransfer: links to files already on the NAS
      title: t("stundtransfer.nas.title"),
      icon: TbShare,
      route: "/admin/nas",
    },
    {
      title: t("stundtransfer.admin.send-files"),
      icon: TbSend,
      route: "/upload",
    },
    {
      title: t("stundtransfer.admin.my-links"),
      icon: TbLink,
      route: "/account/shares",
    },
    {
      title: t("stundtransfer.admin.theme"),
      icon: TbPalette,
      route: "/admin/config/appearance",
    },
    {
      title: t("admin.button.users"),
      icon: TbUsers,
      route: "/admin/users",
    },
    {
      title: t("admin.button.shares"),
      icon: TbLink,
      route: "/admin/shares",
    },
    {
      title: t("admin.button.config"),
      icon: TbSettings,
      route: "/admin/config/stundtransfer", // StundTransfer: was /admin/config/general
    },
    {
      // StundTransfer: install the newest StundTransfer image in one click
      title: t("stundtransfer.update.card"),
      icon: TbCloudDownload,
      route: "/admin/update",
    },
  ]);

  // StundTransfer: the update card says when a new version is waiting
  useEffect(() => {
    stundTransferService
      .getUpdateStatus()
      .then((status) => {
        if (status.available)
          setManagementOptions((options) =>
            options.map((option) =>
              option.route === "/admin/update"
                ? { ...option, title: t("stundtransfer.update.card-available") }
                : option,
            ),
          );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    configService
      .isNewReleaseAvailable()
      .then((isNewReleaseAvailable) => {
        if (isNewReleaseAvailable) {
          // StundTransfer: functional update (another check updates the cards too)
          setManagementOptions((options) => [
            ...options,
            {
              // StundTransfer: an official release must be merged into the fork
              // (installing the official image would remove StundTransfer)
              title: t("stundtransfer.admin.official-update"),
              icon: TbRefresh,
              route:
                "https://github.com/StundZow/StundTransfer/blob/stundtransfer/STUNDTRANSFER.md#r%C3%A9cup%C3%A9rer-une-mise-%C3%A0-jour-du-projet-officiel-upstream",
            },
          ]);
        }
      })
      .catch();
  }, []);

  return (
    <>
      <Meta title={t("admin.title")} />
      <Title mb={30} order={3}>
        <FormattedMessage id="admin.title" />
      </Title>
      <Stack justify="space-between" style={{ height: "calc(100vh - 180px)" }}>
        <Paper withBorder p={40}>
          <Grid>
            {managementOptions
              // StundTransfer: no share management when classic sharing is hidden
              .filter(
                (item) =>
                  item.route !== "/admin/shares" ||
                  isClassicSharingEnabled(config.get),
              )
              .map((item) => {
              return (
                <Col xs={6} key={item.route}>
                  <Paper
                    withBorder
                    component={Link}
                    href={item.route}
                    key={item.title}
                    className={classes.item}
                  >
                    <item.icon
                      color={
                        theme.colors[theme.primaryColor][
                          theme.colorScheme === "dark" ? 3 : 7
                        ]
                      }
                      size={35}
                    />
                    <Text mt={7}>{item.title}</Text>
                  </Paper>
                </Col>
              );
            })}
          </Grid>
        </Paper>

        <Center>
          <Text size="xs" color="dimmed">
            <FormattedMessage id="admin.version" /> {process.env.VERSION}
          </Text>
        </Center>
      </Stack>
    </>
  );
};

export default Admin;
