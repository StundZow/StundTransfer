// StundTransfer: a folder of the NAS (admin picker and folder links): path,
// sort choice (remembered in this browser) and its folders then files.
import { Anchor, Breadcrumbs, Group, Select, Stack, Text, UnstyledButton } from "@mantine/core";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { TbFile, TbFolder } from "react-icons/tb";
import { FormattedMessage, useIntl } from "react-intl";
import CenterLoader from "../components/core/CenterLoader";
import useTranslate from "../hooks/useTranslate.hook";
import { formatSize } from "./depositFiles";
import { NasListing } from "./stundtransfer.service";

type Sort = "date" | "name" | "size";
type Entry = { name: string; modifiedAt: string | null; size?: number };

const SORT_KEY = "stundtransfer:nas-sort";

function savedSort(): Sort {
  try {
    const value = localStorage.getItem(SORT_KEY);
    return value === "name" || value === "size" ? value : "date";
  } catch {
    return "date";
  }
}

const rowStyle = (theme: any) => ({
  padding: "6px 8px",
  borderRadius: theme.radius.sm,
  "&:hover": {
    backgroundColor:
      theme.colorScheme === "dark" ? theme.colors.dark[5] : theme.colors.gray[1],
  },
});

const NasBrowser = ({
  rootLabel,
  listing,
  onOpen,
  fileActions,
  headerActions,
  nameSortAtRoot = false,
}: {
  rootLabel: string;
  listing?: NasListing;
  onOpen: (path: string) => void;
  // Buttons of a file; `path` is relative to the root of the browser
  fileActions: (file: NasListing["files"][number], path: string) => ReactNode;
  headerActions?: ReactNode;
  // The root (e.g. the shared folders of the NAS) is always sorted by name
  nameSortAtRoot?: boolean;
}) => {
  const t = useTranslate();
  const intl = useIntl();
  // Newest first by default (the rushes just added)
  const [sort, setSort] = useState<Sort>("date");
  useEffect(() => setSort(savedSort()), []);

  const choose = (value: Sort) => {
    setSort(value);
    try {
      localStorage.setItem(SORT_KEY, value);
    } catch {
      // Private browsing: the choice is just not remembered
    }
  };

  const atRoot = !(listing?.path ?? "");
  const effectiveSort: Sort = nameSortAtRoot && atRoot ? "name" : sort;

  const sorted = useMemo(() => {
    const byName = (a: Entry, b: Entry) =>
      a.name.localeCompare(b.name, intl.locale, { numeric: true });
    const time = (entry: Entry) => (entry.modifiedAt ? Date.parse(entry.modifiedAt) : 0);
    const compare = (a: Entry, b: Entry) =>
      effectiveSort === "date"
        ? time(b) - time(a) || byName(a, b)
        : effectiveSort === "size"
          ? (b.size ?? 0) - (a.size ?? 0) || byName(a, b)
          : byName(a, b);
    return {
      // Folders have no size: by name when sorting by size
      folders: [...(listing?.folders ?? [])].sort(effectiveSort === "size" ? byName : compare),
      files: [...(listing?.files ?? [])].sort(compare),
    };
  }, [listing, effectiveSort, intl.locale]);

  const parts = (listing?.path ?? "").split("/").filter(Boolean);
  const date = (value: string | null) =>
    value ? `${intl.formatDate(value)} ${intl.formatTime(value)}` : "";

  return (
    <>
      <Group position="apart" mb="sm" align="flex-end">
        <Breadcrumbs separator="›" sx={{ flexWrap: "wrap" }}>
          {[rootLabel, ...parts].map((name, i) => (
            <Anchor
              key={i}
              component="button"
              type="button"
              onClick={() => onOpen(parts.slice(0, i).join("/"))}
            >
              {name}
            </Anchor>
          ))}
        </Breadcrumbs>
        <Group spacing="xs" align="flex-end">
          <Select
            size="xs"
            w={190}
            label={t("stundtransfer.nas.sort")}
            value={effectiveSort}
            disabled={nameSortAtRoot && atRoot}
            onChange={(value) => choose((value as Sort) ?? "date")}
            data={[
              { value: "date", label: t("stundtransfer.nas.sort.date") },
              { value: "name", label: t("stundtransfer.nas.sort.name") },
              { value: "size", label: t("stundtransfer.nas.sort.size") },
            ]}
          />
          {headerActions}
        </Group>
      </Group>

      {!listing ? (
        <CenterLoader />
      ) : sorted.folders.length + sorted.files.length === 0 ? (
        <Text color="dimmed" size="sm" py="md">
          <FormattedMessage id="stundtransfer.nas.empty" />
        </Text>
      ) : (
        <Stack spacing={2} mah={520} sx={{ overflowY: "auto" }}>
          {sorted.folders.map((folder) => (
            <UnstyledButton
              key={`d:${folder.name}`}
              aria-label={folder.name}
              onClick={() => onOpen([...parts, folder.name].join("/"))}
              sx={rowStyle}
            >
              <Group position="apart" noWrap>
                <Group spacing="xs" noWrap sx={{ minWidth: 0 }}>
                  <TbFolder />
                  <Text size="sm" truncate>
                    {folder.name}
                  </Text>
                </Group>
                <Text size="xs" color="dimmed" sx={{ whiteSpace: "nowrap" }}>
                  {date(folder.modifiedAt)}
                </Text>
              </Group>
            </UnstyledButton>
          ))}
          {sorted.files.map((file) => (
            <Group key={`f:${file.name}`} position="apart" noWrap sx={rowStyle}>
              <Group spacing="xs" noWrap sx={{ minWidth: 0 }}>
                <TbFile />
                <Text size="sm" truncate title={file.name}>
                  {file.name}
                </Text>
              </Group>
              <Group spacing="xs" noWrap>
                <Text size="xs" color="dimmed" sx={{ whiteSpace: "nowrap" }}>
                  {date(file.modifiedAt)} · {formatSize(file.size, intl.locale)}
                </Text>
                {fileActions(file, [...parts, file.name].join("/"))}
              </Group>
            </Group>
          ))}
        </Stack>
      )}
    </>
  );
};

export default NasBrowser;
