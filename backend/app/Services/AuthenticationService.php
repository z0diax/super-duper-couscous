<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

class AuthenticationService
{
    public function authenticate(string $identifier, string $password): ?User
    {
        $user = User::query()
            ->where(function ($query) use ($identifier) {
                $query->whereRaw('LOWER(email) = ?', [strtolower($identifier)])
                    ->orWhere('name', $identifier);
            })
            ->first();

        return $user && Hash::check($password, $user->password_hash) ? $user : null;
    }

    public function currentUser(): ?User
    {
        $user = auth()->user();
        if (! $user) {
            return null;
        }

        $credential = session('credential');
        if (! $credential || ! hash_equals($credential, hash('sha256', $user->password_hash))) {
            auth()->logout();
            session()->forget(['user_id', 'credential']);
            return null;
        }

        return $user;
    }
}
