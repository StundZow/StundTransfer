import Head from "next/head";
import useConfig from "../hooks/config.hook";

const Meta = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => {
  const config = useConfig();

  const metaTitle = `${title} - ${config.get("general.appName")}`;
  // StundTransfer: the big logo for link previews (WhatsApp, Discord…);
  // without it they enlarge the small 128 px icon, which looks blurry
  const image = `${(config.get("general.appUrl") ?? "").replace(/\/+$/, "")}/img/logo.png`;

  return (
    <Head>
      <title>{metaTitle}</title>
      <meta name="og:title" content={metaTitle} />
      <meta
        name="og:description"
        content={
          description ?? "An open-source and self-hosted sharing platform."
        }
      />
      <meta name="twitter:title" content={metaTitle} />
      <meta name="twitter:description" content={description} />
      {/* StundTransfer: preview image */}
      <meta property="og:type" content="website" />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="512" />
      <meta property="og:image:height" content="512" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:image" content={image} />
    </Head>
  );
};

export default Meta;
