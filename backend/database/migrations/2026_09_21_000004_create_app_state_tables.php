<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('app_meta')) {
            Schema::create('app_meta', function (Blueprint $table) {
                $table->unsignedBigInteger('id')->primary();
                $table->unsignedBigInteger('revision')->default(0);
                $table->unsignedInteger('schema_version')->default(0);
            });
            DB::table('app_meta')->insert(['id' => 1]);
        }

        if (! Schema::hasTable('app_records')) {
            Schema::create('app_records', function (Blueprint $table) {
                $table->string('collection', 64);
                $table->string('id', 190);
                $table->longText('record_json');
                $table->timestamp('updated_at')->nullable();
                $table->primary(['collection', 'id']);
            });
        }

        if (! Schema::hasTable('app_audit')) {
            Schema::create('app_audit', function (Blueprint $table) {
                $table->bigIncrements('sequence');
                $table->string('id', 64)->unique();
                $table->longText('record_json');
                $table->timestamp('created_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        // These tables are shared with the legacy API and must never be removed.
    }
};
