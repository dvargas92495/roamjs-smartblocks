import {
  Button,
  Intent,
  Popover,
  Spinner,
  SpinnerSize,
} from "@blueprintjs/core";
import apiPut from "roamjs-components/util/apiPut";
import apiDelete from "roamjs-components/util/apiDelete";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import createBlock from "roamjs-components/writes/createBlock";
import deleteBlock from "roamjs-components/writes/deleteBlock";
import getBasicTreeByParentUid from "roamjs-components/queries/getBasicTreeByParentUid";
import getBlockUidFromTarget from "roamjs-components/dom/getBlockUidFromTarget";
import getBlockUidsReferencingBlock from "roamjs-components/queries/getBlockUidsReferencingBlock";
import getCurrentPageUid from "roamjs-components/dom/getCurrentPageUid";
import getDisplayNameByUid from "roamjs-components/queries/getDisplayNameByUid";
import getFirstChildUidByBlockUid from "roamjs-components/queries/getFirstChildUidByBlockUid";
import getPageUidByPageTitle from "roamjs-components/queries/getPageUidByPageTitle";
import getShallowTreeByParentUid from "roamjs-components/queries/getShallowTreeByParentUid";
import getFullTreeByParentUid from "roamjs-components/queries/getFullTreeByParentUid";
import { InputTextNode, TreeNode } from "roamjs-components/types";
import updateBlock from "roamjs-components/writes/updateBlock";
import getSettingValueFromTree from "roamjs-components/util/getSettingValueFromTree";
import { render as renderToast } from "roamjs-components/components/Toast";
import toFlexRegex from "roamjs-components/util/toFlexRegex";
import useSubTree from "roamjs-components/hooks/useSubTree";
import { HIDE_REGEX } from "./core";
import getBlockUidAndTextIncludingText from "roamjs-components/queries/getBlockUidAndTextIncludingText";

const toInputTextNode = (n: TreeNode): InputTextNode => ({
  text: n.text,
  children: n.children.map(toInputTextNode),
});

const ApiButton = ({
  setError,
  onClick,
  text,
  intent,
}: {
  setError: (s: string) => void;
  onClick: () => Promise<void>;
  text: string;
  intent: Intent;
}) => {
  const [loading, setLoading] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", width: 216 }}>
      <Button
        disabled={loading}
        text={text}
        intent={intent}
        style={{ margin: "4px 16px 4px 0", width: 176 }}
        onClick={() => {
          setLoading(true);
          setError("");
          setTimeout(() => {
            onClick()
              .catch((e) => {
                setError(e.response?.data || e.message);
                /*
                renderToast({
                  id: "roamjs-smartblock-publish-failed",
                  content: error,
                  intent: Intent.DANGER,
                });
                */
              })
              .finally(() => {
                setLoading(false);
              });
          }, 1);
        }}
      />
      <span>{loading && <Spinner size={SpinnerSize.SMALL} />}</span>
    </div>
  );
};

const Content = ({
  blockUid,
  onClose,
}: {
  blockUid: string;
  onClose: () => void;
}) => {
  const pageUid = useMemo(
    () => getPageUidByPageTitle("roam/js/smartblocks"),
    []
  );
  const pageTree = useMemo(() => getBasicTreeByParentUid(pageUid), [pageUid]);
  const { text: displayName } = useSubTree({
    tree: pageTree,
    key: "display name",
    parentUid: pageUid,
    order: 3,
  });
  const [error, setError] = useState("");

  const {
    description = [],
    image = [],
    tags = [],
    uuid = [],
  } = useMemo(
    () =>
      Object.fromEntries(
        getBlockUidsReferencingBlock(blockUid).flatMap((uid) =>
          getBasicTreeByParentUid(uid).map((t) => [
            t.text.trim().toLowerCase(),
            t.children.map((t) => t.text),
          ])
        )
      ),
    [blockUid]
  );
  return (
    <div style={{ padding: 32 }}>
      <ApiButton
        text={"Publish Workflow"}
        intent={Intent.PRIMARY}
        setError={setError}
        onClick={() => {
          const { text, children } = getFullTreeByParentUid(blockUid);
          return apiPut<{ uuid: string }>(`smartblocks-store`, {
            uuid: uuid[0],
            name: text
              .replace(/#(42)?SmartBlock/, "")
              .replace(HIDE_REGEX, "")
              .trim(),
            tags,
            img: image[0],
            author: window.roamAlphaAPI.graph.name,
            description: (description[0] || "").replace(/__/g, "_"),
            workflow: JSON.stringify(children.map(toInputTextNode)),
            displayName,
          }).then(async (r) => {
            const ref = `((${blockUid}))`;
            const refUid =
              pageTree.find((t) => t.text.trim() === ref)?.uid ||
              (await createBlock({
                node: { text: ref },
                parentUid: pageUid,
                order: 1,
              }));
            const uuidUid =
              getShallowTreeByParentUid(refUid).find((t) =>
                toFlexRegex("uuid").test(t.text)
              )?.uid ||
              (await createBlock({
                node: { text: "uuid" },
                parentUid: refUid,
              }));
            const valueUid = getFirstChildUidByBlockUid(uuidUid);
            if (valueUid) {
              await updateBlock({ text: r.uuid, uid: valueUid });
            } else {
              await createBlock({
                node: { text: r.uuid },
                parentUid: uuidUid,
              });
            }
            onClose();
            renderToast({
              id: "roamjs-smartblock-publish-success",
              content: `Successfully published workflow to the SmartBlocks Store!`,
              intent: Intent.SUCCESS,
            });
          });
        }}
      />
      {!!uuid[0] && (
        <ApiButton
          text={"Remove From Store"}
          intent={Intent.DANGER}
          setError={setError}
          onClick={() =>
            apiDelete({
              path: `smartblocks-store`,
              data: { uuid: uuid[0], graph: window.roamAlphaAPI.graph.name },
            }).then(() => {
              const ref = `((${blockUid}))`;
              Promise.all(
                getBlockUidAndTextIncludingText(ref).map((b) =>
                  deleteBlock(b.uid)
                )
              ).then(() => {
                onClose();
                renderToast({
                  id: "roamjs-smartblock-delete-success",
                  content: `Successfully deleted workflow from the SmartBlocks Store.`,
                  intent: Intent.SUCCESS,
                });
              });
            })
          }
        />
      )}
      <div style={{ width: 180, lineHeight: "0.75em", marginTop: 4 }}>
        <span style={{ color: "darkred", fontSize: 12 }}>{error}</span>
      </div>
    </div>
  );
};

const SmartblockPopover = ({
  blockUid,
}: {
  blockUid: string;
}): React.ReactElement => {
  const [isOpen, setIsOpen] = useState(false);
  const onClose = useCallback(() => setIsOpen(false), [setIsOpen]);
  return (
    <Popover
      target={
        <img
          className={"roamjs-smartblocks-popover-target"}
          src={
            "https://raw.githubusercontent.com/dvargas92495/roamjs-smartblocks/main/src/img/lego3blocks.png"
          }
        />
      }
      content={<Content blockUid={blockUid} onClose={onClose} />}
      isOpen={isOpen}
      onInteraction={(n) => setIsOpen(n)}
    />
  );
};

export const render = (s: HTMLSpanElement) => {
  const blockUid = getBlockUidFromTarget(s);
  ReactDOM.render(<SmartblockPopover blockUid={blockUid} />, s);
};

export default SmartblockPopover;
