"use client";

import { Modal, UnstyledButton } from "@mantine/core";
import React, { useState } from "react";

interface SiteHeaderActionsProps {
  leadingAction?: React.ReactNode;
}

interface AccountComingSoonModalProps {
  onClose: () => void;
  opened: boolean;
  withinPortal?: boolean;
}

export function AccountComingSoonModal({
  onClose,
  opened,
  withinPortal
}: AccountComingSoonModalProps) {
  return (
    <Modal
      centered
      classNames={{
        body: "account-modal__body",
        close: "account-modal__close",
        content: "account-modal",
        header: "account-modal__header",
        title: "account-modal__title"
      }}
      onClose={onClose}
      opened={opened}
      overlayProps={{
        backgroundOpacity: 0.58,
        blur: 3
      }}
      removeScrollProps={{ removeScrollBar: false }}
      title="Accounts are coming soon"
      withinPortal={withinPortal}
    >
      <p className="account-modal__copy">
        Once accounts are available, you&apos;ll be able to save your favourite
        bands and venues and recieve notifications for gigs you care about.
      </p>
      <UnstyledButton
        className="account-modal__action"
        onClick={onClose}
        type="button"
      >
        Got it
      </UnstyledButton>
    </Modal>
  );
}

export function SiteHeaderActions({ leadingAction }: SiteHeaderActionsProps = {}) {
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  return (
    <div className="site-header__actions">
      {leadingAction}
      <UnstyledButton
        aria-label="Open account information"
        className="site-header__profile"
        onClick={() => setIsAccountModalOpen(true)}
        title="Account"
        type="button"
      >
        <svg
          aria-hidden="true"
          className="site-header__profile-icon"
          fill="none"
          height="22"
          viewBox="0 0 24 24"
          width="22"
        >
          <path
            d="M16.25 8a4.25 4.25 0 1 1-8.5 0 4.25 4.25 0 0 1 8.5 0Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
          <path
            d="M5.75 18.25a6.25 6.25 0 0 1 12.5 0"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      </UnstyledButton>
      <AccountComingSoonModal
        onClose={() => setIsAccountModalOpen(false)}
        opened={isAccountModalOpen}
      />
    </div>
  );
}
