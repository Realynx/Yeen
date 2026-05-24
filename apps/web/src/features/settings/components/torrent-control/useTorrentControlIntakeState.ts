import { type DragEvent, useCallback, useRef, useState } from 'react';

interface UseTorrentControlIntakeStateOptions {
  setError: (value: string | null) => void;
}

export interface TorrentControlIntakeState {
  magnetLink: string;
  torrentFile: File | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  fileInputKey: number;
  isDropTargetActive: boolean;
  handleMagnetLinkChange: (value: string) => void;
  handleDragEnter: () => void;
  handleDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handleDropZoneDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handleDropZoneDrop: (event: DragEvent<HTMLDivElement>) => void;
  handlePickedTorrentFile: (nextFile: File | null) => void;
  handleClearFile: () => void;
  resetIntake: () => void;
}

export function useTorrentControlIntakeState({
  setError,
}: UseTorrentControlIntakeStateOptions): TorrentControlIntakeState {
  const [magnetLink, setMagnetLink] = useState('');
  const [torrentFile, setTorrentFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePickedTorrentFile = useCallback((nextFile: File | null) => {
    if (!nextFile) {
      return;
    }

    const normalizedFileName = nextFile.name.trim().toLowerCase();
    const isTorrentFile =
      nextFile.type === 'application/x-bittorrent' ||
      normalizedFileName.endsWith('.torrent');

    if (!isTorrentFile) {
      setError('Only .torrent files are supported for upload.');
      return;
    }

    setError(null);
    setTorrentFile(nextFile);
    setMagnetLink('');
  }, [setError]);

  const handleDropZoneDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (!isDropTargetActive) {
        setIsDropTargetActive(true);
      }
    },
    [isDropTargetActive],
  );

  const handleDropZoneDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDropTargetActive(false);
      const nextFile = event.dataTransfer.files?.[0] ?? null;
      handlePickedTorrentFile(nextFile);
    },
    [handlePickedTorrentFile],
  );

  const handleMagnetLinkChange = useCallback((value: string) => {
    setMagnetLink(value);

    if (value.trim() && torrentFile) {
      setTorrentFile(null);
      setFileInputKey((previous) => previous + 1);
    }
  }, [torrentFile]);

  const handleDragEnter = useCallback(() => {
    setIsDropTargetActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    setIsDropTargetActive(false);
  }, []);

  const handleClearFile = useCallback(() => {
    setTorrentFile(null);
    setFileInputKey((previous) => previous + 1);
  }, []);

  const resetIntake = useCallback(() => {
    setMagnetLink('');
    setTorrentFile(null);
    setFileInputKey((previous) => previous + 1);
  }, []);

  return {
    magnetLink,
    torrentFile,
    fileInputRef,
    fileInputKey,
    isDropTargetActive,
    handleMagnetLinkChange,
    handleDragEnter,
    handleDragLeave,
    handleDropZoneDragOver,
    handleDropZoneDrop,
    handlePickedTorrentFile,
    handleClearFile,
    resetIntake,
  };
}
