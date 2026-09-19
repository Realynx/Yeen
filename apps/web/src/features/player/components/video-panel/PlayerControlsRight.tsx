import type { RefObject } from 'react';
import type {
  PlaybackAudioTrack,
  SubtitleTrack,
} from '../../../shared/services/types';
import type {
  HlsLevelOption,
  SubtitleFontPreset,
} from '../../services/playerUtils';
import {
  CastIcon,
  FullscreenEnterIcon,
  FullscreenExitIcon,
  PipIcon,
  TheaterIcon,
} from '../PlayerIcons';
import { PlayerAudioMenu } from './PlayerAudioMenu';
import { PlayerSettingsMenu } from './PlayerSettingsMenu';
import { PlayerSubtitleMenu } from './PlayerSubtitleMenu';

type MenuId = null | 'audio' | 'subs' | 'settings';

interface PlayerControlsRightProps {
  menuRootRef: RefObject<HTMLDivElement | null>;
  openMenu: MenuId;
  onToggleMenu: (menu: Exclude<MenuId, null>) => void;
  onCloseMenu: () => void;
  selectedAudioStreamIndex: number | null;
  audioTracks: PlaybackAudioTrack[];
  onSelectAudioTrack: (audioStreamIndex: number) => void;
  activeSubtitle: SubtitleTrack | null;
  selectedSubtitleId: string;
  subtitleTracks: SubtitleTrack[];
  extractingSubtitleTrackId: string | null;
  onSelectSubtitle: (subtitleId: string) => void;
  onExtractSubtitle: (track: SubtitleTrack) => void;
  isPhoneMode: boolean;
  isTvMode: boolean;
  playbackRate: number;
  subtitleFontPreset: SubtitleFontPreset;
  videoBitrateQuotaKbps: number;
  isHlsSource: boolean;
  hlsLevels: HlsLevelOption[];
  qualityMode: 'auto' | number;
  resolutionHeightOptions: number[];
  preferredMaxResolutionHeight: number | null;
  videoBitrateOptionsKbps: number[];
  preferredVideoBitrateKbps: number | null;
  audioBitrateOptionsKbps: number[];
  preferredAudioBitrateKbps: number | null;
  appliedVideoBitrateKbps: number | null;
  appliedAudioBitrateKbps: number | null;
  appliedMaxOutputHeight: number | null;
  onPlaybackRateChange: (nextRate: number) => void;
  onSubtitleFontPresetChange: (nextSubtitleFontPreset: SubtitleFontPreset) => void;
  onQualityModeChange: (nextQualityMode: 'auto' | number) => void;
  onPreferredVideoBitrateChange: (nextVideoBitrateKbps: number | null) => void;
  onPreferredAudioBitrateChange: (nextAudioBitrateKbps: number | null) => void;
  onPreferredResolutionChange: (nextMaxResolutionHeight: number | null) => void;
  canCast: boolean;
  isCasting: boolean;
  castDeviceAvailable: boolean;
  onOpenCastPicker: () => void;
  theaterMode: boolean;
  onToggleTheaterMode: () => void;
  canUsePictureInPicture: boolean;
  isPictureInPicture: boolean;
  onTogglePictureInPicture: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

type DisplayActionsProps = Pick<PlayerControlsRightProps,
  'canCast' | 'isTvMode' | 'isCasting' | 'castDeviceAvailable' | 'onOpenCastPicker'
  | 'isPhoneMode' | 'theaterMode' | 'onToggleTheaterMode' | 'canUsePictureInPicture'
  | 'isPictureInPicture' | 'onTogglePictureInPicture' | 'isFullscreen' | 'onToggleFullscreen'>;

function CastButton(props: Pick<DisplayActionsProps, 'canCast' | 'isTvMode' | 'isCasting' | 'castDeviceAvailable' | 'onOpenCastPicker'>) {
  if (!props.canCast || props.isTvMode) return null;
  return <button type="button" className={`player-icon-button ${props.isCasting ? 'is-active' : ''} ${!props.isCasting && !props.castDeviceAvailable ? 'is-idle' : ''}`}
    onClick={props.onOpenCastPicker} aria-label={props.isCasting ? 'Casting to device' : 'Cast to device'}
    title={props.isCasting ? 'Casting to device' : props.castDeviceAvailable ? 'Cast to device' : 'Search for cast devices'}><CastIcon /></button>;
}

function TheaterButton(props: Pick<DisplayActionsProps, 'isPhoneMode' | 'isTvMode' | 'theaterMode' | 'onToggleTheaterMode'>) {
  if (props.isPhoneMode || props.isTvMode) return null;
  return <button type="button" className={`player-icon-button ${props.theaterMode ? 'is-active' : ''}`}
    onClick={props.onToggleTheaterMode} aria-label={props.theaterMode ? 'Disable theater mode' : 'Enable theater mode'} title="Theater mode"><TheaterIcon /></button>;
}

function PipButton(props: Pick<DisplayActionsProps, 'canUsePictureInPicture' | 'isPictureInPicture' | 'onTogglePictureInPicture' | 'isPhoneMode' | 'isTvMode'>) {
  if (!props.canUsePictureInPicture) return null;
  return <button type="button" className={`player-icon-button ${props.isPictureInPicture ? 'is-active' : ''}`}
    onClick={props.onTogglePictureInPicture} aria-label={props.isPictureInPicture ? 'Exit picture-in-picture' : 'Enter picture-in-picture'}
    title={props.isPhoneMode || props.isTvMode ? 'Picture-in-picture' : 'Picture-in-picture (P)'}><PipIcon /></button>;
}

function FullscreenButton(props: Pick<DisplayActionsProps, 'isTvMode' | 'isPhoneMode' | 'isFullscreen' | 'onToggleFullscreen'>) {
  if (props.isTvMode) return null;
  return <button type="button" className={`player-icon-button ${props.isFullscreen ? 'is-active' : ''}`}
    onClick={props.onToggleFullscreen} aria-label={props.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    title={props.isPhoneMode ? 'Fullscreen' : 'Fullscreen (F)'}>{props.isFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}</button>;
}

function PlayerDisplayActions(props: DisplayActionsProps) {
  return <>
    <CastButton {...props} /><TheaterButton {...props} /><PipButton {...props} /><FullscreenButton {...props} />
  </>;
}

export function PlayerControlsRight({
  menuRootRef,
  openMenu,
  onToggleMenu,
  onCloseMenu,
  selectedAudioStreamIndex,
  audioTracks,
  onSelectAudioTrack,
  activeSubtitle,
  selectedSubtitleId,
  subtitleTracks,
  extractingSubtitleTrackId,
  onSelectSubtitle,
  onExtractSubtitle,
  isPhoneMode,
  isTvMode,
  playbackRate,
  subtitleFontPreset,
  videoBitrateQuotaKbps,
  isHlsSource,
  hlsLevels,
  qualityMode,
  resolutionHeightOptions,
  preferredMaxResolutionHeight,
  videoBitrateOptionsKbps,
  preferredVideoBitrateKbps,
  audioBitrateOptionsKbps,
  preferredAudioBitrateKbps,
  appliedVideoBitrateKbps,
  appliedAudioBitrateKbps,
  appliedMaxOutputHeight,
  onPlaybackRateChange,
  onSubtitleFontPresetChange,
  onQualityModeChange,
  onPreferredVideoBitrateChange,
  onPreferredAudioBitrateChange,
  onPreferredResolutionChange,
  canCast,
  isCasting,
  castDeviceAvailable,
  onOpenCastPicker,
  theaterMode,
  onToggleTheaterMode,
  canUsePictureInPicture,
  isPictureInPicture,
  onTogglePictureInPicture,
  isFullscreen,
  onToggleFullscreen,
}: PlayerControlsRightProps) {
  return (
    <div
      className="player-controls-right"
      ref={menuRootRef}
      data-tv-focus-zone="other"
      data-tv-focus-lane-id="player-controls-right"
    >
      <PlayerAudioMenu
        open={openMenu === 'audio'}
        selectedAudioStreamIndex={selectedAudioStreamIndex}
        audioTracks={audioTracks}
        onToggle={() => onToggleMenu('audio')}
        onSelectAudioTrack={onSelectAudioTrack}
        onClose={onCloseMenu}
      />

      <PlayerSubtitleMenu
        open={openMenu === 'subs'}
        activeSubtitle={activeSubtitle}
        selectedSubtitleId={selectedSubtitleId}
        subtitleTracks={subtitleTracks}
        extractingSubtitleTrackId={extractingSubtitleTrackId}
        isPhoneMode={isPhoneMode || isTvMode}
        onToggle={() => onToggleMenu('subs')}
        onClose={onCloseMenu}
        onSelectSubtitle={onSelectSubtitle}
        onExtractSubtitle={onExtractSubtitle}
      />

      <PlayerSettingsMenu
        open={openMenu === 'settings'}
        playbackRate={playbackRate}
        subtitleFontPreset={subtitleFontPreset}
        videoBitrateQuotaKbps={videoBitrateQuotaKbps}
        isHlsSource={isHlsSource}
        hlsLevels={hlsLevels}
        qualityMode={qualityMode}
        resolutionHeightOptions={resolutionHeightOptions}
        preferredMaxResolutionHeight={preferredMaxResolutionHeight}
        videoBitrateOptionsKbps={videoBitrateOptionsKbps}
        preferredVideoBitrateKbps={preferredVideoBitrateKbps}
        audioBitrateOptionsKbps={audioBitrateOptionsKbps}
        preferredAudioBitrateKbps={preferredAudioBitrateKbps}
        appliedVideoBitrateKbps={appliedVideoBitrateKbps}
        appliedAudioBitrateKbps={appliedAudioBitrateKbps}
        appliedMaxOutputHeight={appliedMaxOutputHeight}
        onToggle={() => onToggleMenu('settings')}
        onPlaybackRateChange={onPlaybackRateChange}
        onSubtitleFontPresetChange={onSubtitleFontPresetChange}
        onQualityModeChange={onQualityModeChange}
        onPreferredVideoBitrateChange={onPreferredVideoBitrateChange}
        onPreferredAudioBitrateChange={onPreferredAudioBitrateChange}
        onPreferredResolutionChange={onPreferredResolutionChange}
      />

      <PlayerDisplayActions {...{ canCast, isTvMode, isCasting, castDeviceAvailable,
        onOpenCastPicker, isPhoneMode, theaterMode, onToggleTheaterMode,
        canUsePictureInPicture, isPictureInPicture, onTogglePictureInPicture,
        isFullscreen, onToggleFullscreen }} />
    </div>
  );
}
