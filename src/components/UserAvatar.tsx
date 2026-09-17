import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Style } from '@dicebear/core';
import lorelei from '@dicebear/styles/lorelei.json';

const avatarStyle = new Style(lorelei);
const avatarCache = new Map<string, string>();
const backgroundColors = ['dbeafe', 'e0e7ff', 'ede9fe', 'fce7f3', 'dcfce7'];

interface UserAvatarProps {
  seed: string;
  name: string;
  initials?: string;
  className?: string;
  imageClassName?: string;
}

const fallbackInitials = (name: string) => name
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase() || '')
  .join('') || '?';

const createAvatarUri = (seed: string, name: string): string | null => {
  const cacheKey = `${seed}:${name}`;
  const cached = avatarCache.get(cacheKey);
  if (cached) return cached;

  try {
    const uri = new Avatar(avatarStyle, {
      seed: seed || name,
      title: `${name} avatar`,
      backgroundColor: backgroundColors,
      backgroundColorOrder: 'random',
      scale: 0.84,
    }).toDataUri();

    avatarCache.set(cacheKey, uri);
    return uri;
  } catch {
    return null;
  }
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  seed,
  name,
  initials,
  className = '',
  imageClassName = '',
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUri = useMemo(() => createAvatarUri(seed, name), [seed, name]);

  useEffect(() => setImageFailed(false), [avatarUri]);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-blue-100 text-blue-800 ${className}`}
      title={name}
    >
      {!avatarUri || imageFailed ? (
        <span className="font-bold" aria-hidden="true">{initials || fallbackInitials(name)}</span>
      ) : (
        <img
          src={avatarUri}
          alt={`${name} avatar`}
          draggable={false}
          onError={() => setImageFailed(true)}
          className={`h-full w-full object-cover ${imageClassName}`}
        />
      )}
    </span>
  );
};
